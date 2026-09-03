# The metrics endpoint cannot answer the only question anyone asks of it

**Status:** shipped
**Touches:** `packages/server/src/services/metrics.service.ts`, `packages/server/src/routes/index.ts`, `packages/client/common.conf`, `packages/server/package.json`
**Ships with:** `fix/prometheus-metrics` — closes #84

---

## 1. What the code does today

`metrics.service.ts` is a hand-written registry: a `Map` of per-route counters
and a `toPrometheus()` that formats them by string concatenation. It reports
four things per route:

```ts
interface RequestMetrics {
  count: number;
  errors: number;
  latencyMsSum: number;
  latencyMsMax: number;
}
```

**A sum and a max are not a latency distribution.** Mean latency (`sum/count`)
hides everything: an endpoint where 99 requests take 10ms and one takes 5s has
a mean of 60ms, which looks healthy. Max is the opposite problem — one slow
request makes it look broken forever. p95 and p99 are the numbers worth
alerting on, and **neither can be computed from a sum and a max**. The endpoint
exists, is well-formed Prometheus text, and cannot answer the question it was
built for.

**The series count is unbounded.** Keys come from a regex normaliser over the
raw URL:

```ts
path = path.replace(new RegExp("^/api/v1/rooms/[^/]+$"), "/api/v1/rooms/:id");
// ...five more hand-written rules...
path = path.replace(/\/[a-f0-9-]{36}/g, "/:uuid");
path = path.replace(/\/\d+/g, "/:id");
```

Anything those rules do not collapse is kept verbatim, as a permanent entry in
an in-process `Map`. A scanner walking `/admin1`, `/admin2`, `/admin3` mints a
series each, and they never expire. The normaliser also has to be maintained in
step with the router — a new route with a parameter is a new rule someone must
remember to add, and forgetting produces a slow leak rather than an error.

**The counts are per-process.** Two containers report two disjoint sets of
numbers, both labelled identically, and neither is the total.

## 2. What I am changing, and why

**`prom-client`, the standard library, instead of a hand-rolled registry.**

`http_request_duration_seconds` becomes a **histogram** with buckets, which is
what makes `histogram_quantile(0.95, ...)` computable at query time. Seconds
rather than milliseconds, per Prometheus convention, with buckets chosen around
this app's shape: most calls are tens of milliseconds, report and PDF paths are
the slow tail, and anything past 10s is already a failure the request timeout
ends.

`collectDefaultMetrics` brings process memory, event-loop lag and GC pauses —
the three things that explain "the app is slow" when no individual endpoint
looks slow.

**Labels come from Express's matched route pattern**, read on `finish` because
`req.route` is only populated after routing:

```ts
const routePath = req.route?.path;          // "/:id/start"
if (!routePath) return UNMATCHED_ROUTE;
return `${req.baseUrl}${routePath}`;        // "/api/v1/rooms/:id/start"
```

This is the cardinality fix, and it works by inversion. The old code tried to
*recognise* every URL shape and kept what it did not recognise. This takes the
pattern the router already matched, and everything with no match — every 404,
every scanner path — collapses into a single `unmatched` series. Cardinality is
now bounded by the number of routes in the app, which is a number that changes
when someone writes a route, not when someone sends a request.

**Per-instance series are now correct rather than merged.** Each container
exposes its own values under its own scrape target; Prometheus aggregates
across them at query time. That is the model the endpoint should always have
had — the previous per-process counts were not wrong so much as
un-interpretable once a second container existed.

**The endpoint is denied at the edge.** `/api/` is publicly proxied by nginx,
so `/api/v1/metrics` was reachable from the internet — it reveals route names,
traffic volumes and error rates. `common.conf` now denies `= /api/v1/metrics`.
It stays unauthenticated *inside* the Docker network, which is where a scraper
would run, so blocking at the edge is what keeps a credential-free in-network
scrape working while closing the public path.

## 3. What this affects

**Every existing metric name changes.** `http_request_duration_ms_sum` and
`http_request_duration_ms_max` are gone; `http_requests_total` keeps its name
but gains a `status_code` label and changes its `path` label to `route`. Any
dashboard or alert built on the old names breaks — as far as is known, nothing
scrapes this endpoint yet, which is precisely why now is the cheap moment to
change it.

**More series than before, deliberately.** A histogram is one series per
bucket per label combination, so this endpoint's output grows substantially.
That is the cost of percentiles, and it is bounded — 11 buckets × routes ×
status codes — where the old unbounded growth was not.

**`process_uptime_seconds` is replaced** by `prom-client`'s
`process_start_time_seconds`, which is the conventional name and lets
Prometheus compute uptime itself.

**How we would know it broke.** Scrape `/api/v1/metrics` from inside the
network and confirm `http_request_duration_seconds_bucket` lines are present
and `nodejs_eventloop_lag_seconds` is being reported. From outside, confirm the
same URL returns 403. Then run
`histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))`
and confirm it returns numbers.

## 4. What to learn from this

**A sum and a max cannot be turned into a percentile — this is arithmetic, not
tooling.** Percentiles need the distribution, which is why histograms exist:
bucket counts are additive across instances and over time, so a percentile can
be estimated at query time from data that was cheap to record. Any latency
metric that is not a histogram or a summary is a metric you cannot alert on
usefully. Check this the moment someone reports "we have latency metrics".

**Cardinality is a budget, and unbounded label values spend it for you.** Every
distinct label combination is a stored time series. Anything derived from
user-controlled input — a URL, a user id, an error message — will eventually be
supplied with unbounded variety, whether by a scanner, a bug, or ordinary
growth. The safe construction is to map to a **closed set of known values** and
collapse everything else to one bucket, rather than trying to recognise every
input.

**Prefer the standard client library for anything with a wire format.**
Hand-rolling Prometheus text output looks trivial — it is line-oriented and
mostly obvious — and the trivial part is not where the cost is. The cost is in
histogram bucketing, exemplars, default process metrics, escaping, and the
conventions a scraper expects. This registry was competently written and still
could not do the one thing it was built for.
