import { useState } from "react";
import { Megaphone, AlertTriangle, Send, Users, Loader2 } from "lucide-react";
import { ORG_BROADCAST_PRIORITIES, type OrgBroadcastPriority, type OrgBroadcastResult } from "@application/shared";
import { adminApi, ApiClientError } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TITLE_MAX = 200;
const BODY_MAX = 2000;

const PRIORITY_COPY: Record<OrgBroadcastPriority, { label: string; help: string }> = {
  normal: {
    label: "Normal",
    help: "Goes out on each member's enabled channels. Anyone who has muted email or push will not be contacted there.",
  },
  urgent: {
    label: "Urgent",
    help: "Reaches every member on in-app, push and email even if they have muted those channels, and wakes their device. Use only when the message cannot wait.",
  },
};

export const AdminBroadcast = () => {
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<OrgBroadcastPriority>("normal");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<OrgBroadcastResult | null>(null);

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const canSend = trimmedTitle.length > 0 && trimmedBody.length > 0 && !sending;

  const send = async () => {
    setSending(true);
    try {
      const sent = await adminApi.sendBroadcast({ title: trimmedTitle, body: trimmedBody, priority });
      setResult(sent);
      setConfirming(false);
      setTitle("");
      setBody("");
      setPriority("normal");
      toast(
        `Broadcast sent to ${sent.recipients} member${sent.recipients === 1 ? "" : "s"}`,
        "success",
      );
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : "The broadcast could not be sent. Nothing was delivered — try again.";
      toast(message, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-purple-100 p-2 text-purple-700">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Broadcast</h1>
          <p className="text-sm text-slate-600">
            Send a message to everyone in your organisation. Broadcasts cannot be recalled once sent.
          </p>
        </div>
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="space-y-1 pt-6 text-sm text-green-900">
            <p className="font-semibold">
              Sent to {result.recipients} member{result.recipients === 1 ? "" : "s"}
            </p>
            <p>
              {result.inApp} in-app · {result.webPush} push · {result.email} email
            </p>
            {result.failed > 0 && (
              <p className="text-amber-800">
                {result.failed} recipient{result.failed === 1 ? "" : "s"} could not be reached. The rest were
                delivered.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <Label htmlFor="broadcast-title">Title</Label>
            <Input
              id="broadcast-title"
              value={title}
              maxLength={TITLE_MAX}
              placeholder="Venue change for Saturday"
              onChange={(e) => setTitle(e.target.value)}
              disabled={sending}
            />
            <p className="text-right text-xs text-slate-500">
              {title.length}/{TITLE_MAX}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="broadcast-body">Message</Label>
            <textarea
              id="broadcast-body"
              value={body}
              maxLength={BODY_MAX}
              rows={7}
              placeholder="Write the message your members will receive."
              onChange={(e) => setBody(e.target.value)}
              disabled={sending}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 disabled:opacity-60"
            />
            <p className="text-right text-xs text-slate-500">
              {body.length}/{BODY_MAX}
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-900">Priority</legend>
            <div className="space-y-2">
              {ORG_BROADCAST_PRIORITIES.map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer gap-3 rounded-md border p-3 ${
                    priority === value ? "border-purple-500 bg-purple-50" : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="priority"
                    value={value}
                    checked={priority === value}
                    onChange={() => setPriority(value)}
                    disabled={sending}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">{PRIORITY_COPY[value].label}</span>
                    <span className="block text-xs text-slate-600">{PRIORITY_COPY[value].help}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {priority === "urgent" && (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                An urgent broadcast overrides every member's notification preferences. Members who have muted a
                channel will still be contacted on it.
              </span>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => setConfirming(true)} disabled={!canSend}>
              <Send className="mr-2 h-4 w-4" /> Review and send
            </Button>
          </div>
        </CardContent>
      </Card>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-5 w-5 text-purple-700" />
                <div>
                  <CardTitle className="text-base">Send to your whole organisation?</CardTitle>
                  <CardDescription>
                    Every active member will receive this{priority === "urgent" ? ", including anyone who has muted these channels" : ""}. It
                    cannot be recalled.
                  </CardDescription>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{trimmedTitle}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{trimmedBody}</p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={sending}>
                  Back
                </Button>
                <Button onClick={send} disabled={sending}>
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" /> Send broadcast
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AdminBroadcast;
