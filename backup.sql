--
-- PostgreSQL database dump
--

\restrict sEoWBef1e1fRXFZ0LLrLkHlWGImUfcx1ob6wBWbE3BMT3qBuPsuB14dXFd4wnXA

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: evently_admin
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO evently_admin;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: recording_status; Type: TYPE; Schema: public; Owner: evently_admin
--

CREATE TYPE public.recording_status AS ENUM (
    'pending',
    'active',
    'completed',
    'failed'
);


ALTER TYPE public.recording_status OWNER TO evently_admin;

--
-- Name: room_status; Type: TYPE; Schema: public; Owner: evently_admin
--

CREATE TYPE public.room_status AS ENUM (
    'scheduled',
    'live',
    'ended',
    'cancelled'
);


ALTER TYPE public.room_status OWNER TO evently_admin;

--
-- Name: stream_provider; Type: TYPE; Schema: public; Owner: evently_admin
--

CREATE TYPE public.stream_provider AS ENUM (
    'livekit',
    'youtube'
);


ALTER TYPE public.stream_provider OWNER TO evently_admin;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: evently_admin
--

CREATE TYPE public.user_role AS ENUM (
    'super_admin',
    'event_admin',
    'organizer'
);


ALTER TYPE public.user_role OWNER TO evently_admin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: evently_admin
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO evently_admin;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: evently_admin
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO evently_admin;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: evently_admin
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: attendance_entries; Type: TABLE; Schema: public; Owner: evently_admin
--

CREATE TABLE public.attendance_entries (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    room_id uuid NOT NULL,
    form_definition_id uuid NOT NULL,
    submitted_by uuid,
    data jsonb NOT NULL,
    photo_key character varying(256),
    photo_url text,
    ip_address character varying(45),
    user_agent text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.attendance_entries OWNER TO evently_admin;

--
-- Name: event_rooms; Type: TABLE; Schema: public; Owner: evently_admin
--

CREATE TABLE public.event_rooms (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    created_by uuid NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    status public.room_status DEFAULT 'scheduled'::public.room_status NOT NULL,
    scheduled_start timestamp with time zone NOT NULL,
    scheduled_end timestamp with time zone NOT NULL,
    actual_start timestamp with time zone,
    actual_end timestamp with time zone,
    max_participants integer,
    share_token character varying(32) NOT NULL,
    livekit_room_name character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    stream_provider public.stream_provider DEFAULT 'livekit'::public.stream_provider NOT NULL,
    youtube_watch_url text,
    youtube_embed_url text
);


ALTER TABLE public.event_rooms OWNER TO evently_admin;

--
-- Name: form_definitions; Type: TABLE; Schema: public; Owner: evently_admin
--

CREATE TABLE public.form_definitions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    room_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    fields jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.form_definitions OWNER TO evently_admin;

--
-- Name: org_members; Type: TABLE; Schema: public; Owner: evently_admin
--

CREATE TABLE public.org_members (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role public.user_role NOT NULL,
    invited_by uuid,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.org_members OWNER TO evently_admin;

--
-- Name: organizations; Type: TABLE; Schema: public; Owner: evently_admin
--

CREATE TABLE public.organizations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(160) NOT NULL,
    slug character varying(80) NOT NULL,
    description text,
    logo_url text,
    website_url text,
    contact_email character varying(320),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.organizations OWNER TO evently_admin;

--
-- Name: room_recordings; Type: TABLE; Schema: public; Owner: evently_admin
--

CREATE TABLE public.room_recordings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    room_id uuid NOT NULL,
    status public.recording_status DEFAULT 'pending'::public.recording_status NOT NULL,
    egress_id character varying(80),
    s3_key character varying(256),
    mime_type character varying(64),
    size_bytes bigint,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.room_recordings OWNER TO evently_admin;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: evently_admin
--

CREATE TABLE public.sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    family_id uuid NOT NULL,
    replaced_by_id uuid,
    user_agent text,
    ip_address character varying(45),
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sessions OWNER TO evently_admin;

--
-- Name: users; Type: TABLE; Schema: public; Owner: evently_admin
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(320) NOT NULL,
    password_hash text,
    full_name character varying(120) NOT NULL,
    role public.user_role DEFAULT 'organizer'::public.user_role NOT NULL,
    organization_id uuid,
    google_id character varying(128),
    email_verified_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.users OWNER TO evently_admin;

--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: evently_admin
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: evently_admin
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
1	9d765d1dd0c5de80b7ea167744a3558199ffde744c27dbc3ef23a234782203f0	1776327389044
2	a86c4fcd89372de9e386e03a5d5a2e14429daa1e2012d6e4ad4d46fcc0e0256b	1776779288656
3	456ab9635c37af0fbbf0152bf0983225f5c33590b6d1d1c7f58e832aea4f19e5	1776840451764
\.


--
-- Data for Name: attendance_entries; Type: TABLE DATA; Schema: public; Owner: evently_admin
--

COPY public.attendance_entries (id, room_id, form_definition_id, submitted_by, data, photo_key, photo_url, ip_address, user_agent, submitted_at) FROM stdin;
d3e9c433-eaef-4bea-a5ee-3b4f021cb41f	785117a5-ea35-414d-8ad0-4740e3ddb550	ce11af1e-de3f-46ff-9b20-aa99fdac559d	43a4306b-44e2-4ff1-9655-5e561ec8e42d	{"age": 30, "name": "Alice", "agree": true, "email": "a@b.com", "phone": "+919876543210", "gender": "female"}	attendance/785117a5-ea35-414d-8ad0-4740e3ddb550/bHDEjwq9h_zu0-B-nV_yoIxV.jpg	http://localhost:9000/evently-recordings/attendance/785117a5-ea35-414d-8ad0-4740e3ddb550/bHDEjwq9h_zu0-B-nV_yoIxV.jpg	::ffff:172.18.0.1	curl/8.17.0	2026-04-22 08:13:35.49786+00
d57a5509-2984-4ec2-b850-6ed0858f0b44	753b2d11-63c0-4e40-ae3b-f6f9c3e76bc2	b4766b8a-3bf6-4815-8724-50489cbe95ea	21ee6fbf-1ab1-4aa1-90ca-7265775e77de	{"name": "Alice", "email": "a@b.com", "gender": "female"}	attendance/753b2d11-63c0-4e40-ae3b-f6f9c3e76bc2/1tGb3PfO88D3KPjipGi_JoR7.jpg	http://localhost:9000/evently-recordings/attendance/753b2d11-63c0-4e40-ae3b-f6f9c3e76bc2/1tGb3PfO88D3KPjipGi_JoR7.jpg	::ffff:172.18.0.1	curl/8.17.0	2026-04-22 08:27:00.732486+00
38357b70-8417-49ed-8b7d-0075320355aa	d9bb5476-d170-40f6-9e52-034ffa536d1b	4dd6124c-8399-4206-9deb-51a479398180	7822732e-4ec5-4499-b3b5-f790dcf70d4b	{"n": "User1"}	\N	\N	::ffff:172.18.0.1	curl/8.17.0	2026-04-22 08:27:21.132994+00
9d4e8250-c187-4463-9d7f-97726235dcce	d9bb5476-d170-40f6-9e52-034ffa536d1b	4dd6124c-8399-4206-9deb-51a479398180	7822732e-4ec5-4499-b3b5-f790dcf70d4b	{"n": "User2"}	\N	\N	::ffff:172.18.0.1	curl/8.17.0	2026-04-22 08:27:21.297508+00
cee8325a-3279-445b-87ed-17a9c95e43d0	d9bb5476-d170-40f6-9e52-034ffa536d1b	4dd6124c-8399-4206-9deb-51a479398180	7822732e-4ec5-4499-b3b5-f790dcf70d4b	{"n": "User3"}	\N	\N	::ffff:172.18.0.1	curl/8.17.0	2026-04-22 08:27:21.472921+00
5820701e-b5c3-4a43-9a15-baa523eb8e41	8637d8c1-e75f-4ed8-9bae-f912d15846e3	b8af1ff1-50d6-41a9-8fd4-1980d58dd913	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	{"1bsoz37j": "formtest", "69xtra6s": 12345678912, "axa1zbh1": "1234567890", "enl6kk6u": "formTest@gmail.com", "qdwsmmym": 42342352434, "z08jc97r": "fgd"}	\N	\N	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-22 15:08:45.030231+00
6e80fa19-544a-45f6-9ed4-453677a12a82	3d7f71e3-ff20-4638-8a6c-09c80017d89f	1c2f4936-f376-4558-8dd6-6776b07fb9e7	8cb0404c-713f-4324-bc60-fbb7b3d3716c	{"name": "Alice Smoke", "role": "Engineer", "email": "alice@smoke.dev"}	attendance/3d7f71e3-ff20-4638-8a6c-09c80017d89f/bKSXlkjSCH4qHHdd7k0I70Hr.jpg	http://localhost:9000/evently-recordings/attendance/3d7f71e3-ff20-4638-8a6c-09c80017d89f/bKSXlkjSCH4qHHdd7k0I70Hr.jpg	::ffff:172.18.0.1	curl/8.17.0	2026-05-04 12:22:55.321901+00
34ccf766-8865-4f4e-8af8-160ee92d46d7	5ed559b8-a4d6-4017-871e-c953c0aa8df3	c9f612bb-9ec7-4bb6-afd4-086b638c943d	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	{"hortvbxu": "test", "kus49x39": "test@gmail.com", "yt63vmmo": "1234567890"}	\N	\N	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-05-08 14:25:35.503986+00
f89df3b6-4cee-48c2-9eeb-fec99d6e19c9	5ed559b8-a4d6-4017-871e-c953c0aa8df3	c9f612bb-9ec7-4bb6-afd4-086b638c943d	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	{"hortvbxu": "test2", "kus49x39": "test2@gmail.com", "yt63vmmo": "1234567890"}	\N	\N	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	2026-05-13 11:13:25.740256+00
38187b3e-dd24-4021-8d59-1bf05e1e950d	5ed559b8-a4d6-4017-871e-c953c0aa8df3	c9f612bb-9ec7-4bb6-afd4-086b638c943d	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	{"hortvbxu": "test_capture", "kus49x39": "test_capture@gmail.com", "yt63vmmo": "1234567890"}	attendance/5ed559b8-a4d6-4017-871e-c953c0aa8df3/yykWomjVKFumsUVpu5urgnao.jpg	http://localhost:9000/evently-recordings/attendance/5ed559b8-a4d6-4017-871e-c953c0aa8df3/yykWomjVKFumsUVpu5urgnao.jpg	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	2026-05-14 10:06:54.039106+00
0702de90-10b4-459e-ad48-a35d5bfbd7b7	5a21c8a9-acb0-42f4-adcc-dd01cd36f60b	bcabfba4-ab6d-45a8-80e7-ccfa3ca45317	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	{"8g3ffy67": "Test new", "9dfdv89s": "Male", "buz4hs71": "test@gmail.com", "cskic1ia": "1234567890", "fipbo88u": 1}	attendance/5a21c8a9-acb0-42f4-adcc-dd01cd36f60b/Ux1m6amXVT1pNQPf-DKLevrg.jpg	http://localhost:9000/evently-recordings/attendance/5a21c8a9-acb0-42f4-adcc-dd01cd36f60b/Ux1m6amXVT1pNQPf-DKLevrg.jpg	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	2026-05-14 12:18:32.525905+00
\.


--
-- Data for Name: event_rooms; Type: TABLE DATA; Schema: public; Owner: evently_admin
--

COPY public.event_rooms (id, organization_id, created_by, title, description, status, scheduled_start, scheduled_end, actual_start, actual_end, max_participants, share_token, livekit_room_name, created_at, updated_at, deleted_at, stream_provider, youtube_watch_url, youtube_embed_url) FROM stdin;
b7f2eede-b452-44d8-a92c-ff7b7afdd2ee	7e7b113c-9317-4e88-a3cb-b4d3d01aaa88	00a60c59-8318-4b0a-82b8-a9eae0725263	Demo Event	End-to-end test	live	2026-04-20 09:00:00+00	2026-04-20 10:00:00+00	2026-04-16 12:47:14.522+00	\N	200	FDjop2zDHs-zx9lPLXi5TZfUUxE2BdRi	\N	2026-04-16 12:46:45.669056+00	2026-04-16 12:47:14.522+00	\N	livekit	\N	\N
d17db858-c9eb-4a78-bb9b-6d2de12b0878	fddb472b-0bb3-4a8a-b8c8-94d947981ae2	35853014-975c-4484-96af-2d36060ab46c	Test Room	\N	scheduled	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	\N	\N	\N	7WQUFsFnnTCdqu895w8iyWtMZxMkRtPl	\N	2026-04-17 09:53:43.265075+00	2026-04-17 09:53:43.265075+00	\N	livekit	\N	\N
5978d80d-8065-498d-9e2f-338e54609bcf	c9a87df1-36b6-45b1-9719-d6c0149b0465	10341386-c4c5-4e08-8421-f65264d31f66	Sprint 1 Demo Room (renamed)	MVP smoke test	ended	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	2026-04-17 11:44:21.578+00	2026-04-17 11:44:21.757+00	50	PHgf6v2OEpdwu_MGCldtM8hSEtWmUDS3	\N	2026-04-17 11:44:06.635417+00	2026-04-17 11:45:17.952+00	2026-04-17 11:45:17.952+00	livekit	\N	\N
48f3bc22-4980-4dbb-be25-055426e9bed1	39439ece-1a9e-4090-9662-eb5edb725e93	3079a8cf-4016-4bde-b406-2806ec9da7ec	Ship Smoke	\N	scheduled	2026-06-01 10:00:00+00	2026-06-01 11:00:00+00	\N	\N	\N	hHOAyCsz91xy9eGlq9fLg8D1dwdEzpeW	\N	2026-04-17 11:48:15.623853+00	2026-04-17 11:48:15.623853+00	\N	livekit	\N	\N
6803869e-79cf-4807-917e-c73465fd9fa6	b3044578-71ec-4be3-bbd5-ae9a03b91eda	7d80b259-8db9-4a9d-ad25-330671afbe00	Main Branch Smoke	\N	scheduled	2026-06-01 10:00:00+00	2026-06-01 11:00:00+00	\N	\N	\N	DIoDIIBUTWpeghBF02CeEmW28rNexCf6	\N	2026-04-21 08:29:14.189872+00	2026-04-21 08:29:14.189872+00	\N	livekit	\N	\N
ce0aa64e-2965-4ce4-abbb-3d2635a675e5	de0bcbec-788f-4d15-b0a2-1b820890b489	60340164-96f8-4061-ab2b-3880392c8333	Sprint 1 Demo Room	demo	ended	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	2026-04-21 09:59:38.063+00	2026-04-21 09:59:40.38+00	50	gxXcp11Wiq8H7zwBbwd4OFJB6JlMVyfL	\N	2026-04-21 09:59:33.639864+00	2026-04-21 09:59:42.285+00	2026-04-21 09:59:42.285+00	livekit	\N	\N
85d33c86-e6eb-425d-832f-12f31812e481	ca2ae2ed-629c-4776-838d-926d02a4a0bd	9cc8a327-e787-45c0-8e6a-99cc156d6d20	OrgA Room	\N	scheduled	2026-06-01 10:00:00+00	2026-06-01 11:00:00+00	\N	\N	\N	YCYGJTtKyzzH5qaLIohnk30HShu9WgHn	\N	2026-04-21 10:01:10.625293+00	2026-04-21 10:01:10.625293+00	\N	livekit	\N	\N
a8d714c4-fd82-494f-880d-a24ff46ae632	0448a2ca-fe5c-48b0-b7a2-d8107f40e4c7	1bddbac9-816f-48a2-9d7f-da1bb2ab7abc	YT Fallback Test	\N	scheduled	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	\N	\N	\N	BRy1M96BABR07uM9fW5_AV7CiKIwwyyn	\N	2026-04-21 14:02:36.353533+00	2026-04-21 14:02:37.583+00	\N	livekit	\N	\N
c51a7cee-6883-40f8-9fe1-6dce4bea9e47	026400d2-3503-49ad-92bb-5c139e975b86	55dd435c-c23c-4057-b95d-71d140b3833f	Form Test	\N	scheduled	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	\N	\N	\N	rDrmQYABbqPzZldPWYEqmruyD4rK5wwh	\N	2026-04-22 06:57:47.982436+00	2026-04-22 06:57:47.982436+00	\N	livekit	\N	\N
dcdd399d-f965-4bc6-9a89-0cd9750f9c34	ac0e8778-f130-438b-9e8d-cfc9ea2a63d2	37cca90e-1105-4add-9336-5064497ca7bc	Form Test	\N	scheduled	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	\N	\N	\N	A6GMoT7iAoQCUq1ynjtnCMBQcs0vphoW	\N	2026-04-22 07:15:04.425446+00	2026-04-22 07:15:04.425446+00	\N	livekit	\N	\N
785117a5-ea35-414d-8ad0-4740e3ddb550	013f0291-44c7-4cf9-b9ac-12476cb17cb7	43a4306b-44e2-4ff1-9655-5e561ec8e42d	Att	\N	scheduled	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	\N	\N	\N	FxrDjGuANwAdreEf5B7J2YcLLiU860Dp	\N	2026-04-22 08:13:32.251085+00	2026-04-22 08:13:32.251085+00	\N	livekit	\N	\N
0dbc06ff-6350-4f4f-8e6b-84666bcb7d69	78e2e21b-21f9-4335-acbb-7dc3f727d6c9	fc29a092-b21f-4f3e-8282-b9d7dc1bd050	Att	\N	scheduled	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	\N	\N	\N	mcFXUQnT0CrW-H3iR_wgwwCv7Dj1_uVD	\N	2026-04-22 08:16:11.846226+00	2026-04-22 08:16:11.846226+00	\N	livekit	\N	\N
a9bdf11e-2279-43ef-b4f2-3c5f3ce63c85	8c56cf26-daae-4ea5-9888-c4e09a2520a5	b3897f61-81d0-424d-bf0c-74451aedab60	A	\N	scheduled	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	\N	\N	\N	z1nrySw5EgzVCmG36epUPB5VWlkgB-qX	\N	2026-04-22 08:23:49.454286+00	2026-04-22 08:23:49.454286+00	\N	livekit	\N	\N
0f86e6f3-92f1-489d-bef8-ef7c324230a4	6960c594-66f5-49e1-ae37-95f833033a8b	326b6978-cad0-40c3-aec2-843b07cdf604	A	\N	scheduled	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	\N	\N	\N	eYj4mTbjpdKhQ0uTIx1xsFqkF7Sn6jRk	\N	2026-04-22 08:24:42.616913+00	2026-04-22 08:24:42.616913+00	\N	livekit	\N	\N
d1f5a0b7-77b9-4435-ba63-0a9d88441897	bea42115-eafd-48cb-a060-aa94829b9638	d5bc7a16-948b-48e4-8ec6-3773b5bb6ebf	A	\N	scheduled	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	\N	\N	\N	ZKWuOVDWo1ygtRd0SwqIwy360S-Vz2rI	\N	2026-04-22 08:25:25.296623+00	2026-04-22 08:25:25.296623+00	\N	livekit	\N	\N
b9367072-3629-4867-bc67-c9f8a39f2978	96c1800f-e33f-49f4-b423-bc2957bbfa38	57cbd3a8-4b76-4ac9-8f27-ae2ddf3fcdb9	A	\N	scheduled	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	\N	\N	\N	ReODY6CnmRYSrWgJZAJVLX7nSRX4CwLb	\N	2026-04-22 08:26:15.099599+00	2026-04-22 08:26:15.099599+00	\N	livekit	\N	\N
753b2d11-63c0-4e40-ae3b-f6f9c3e76bc2	5fa21644-8e2c-4a1d-be21-fd446905dd86	21ee6fbf-1ab1-4aa1-90ca-7265775e77de	Full	\N	scheduled	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	\N	\N	\N	F-6-jLNrFGzaXbDynVhmTyMbvvSpdpNj	\N	2026-04-22 08:26:57.195604+00	2026-04-22 08:26:57.195604+00	\N	livekit	\N	\N
d9bb5476-d170-40f6-9e52-034ffa536d1b	03a3e9d4-ff6e-431a-b468-c21a806f8a5a	7822732e-4ec5-4499-b3b5-f790dcf70d4b	L	\N	scheduled	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	\N	\N	\N	IDQdiTZGLH-lo9N620khr-JnR3x_HWpG	\N	2026-04-22 08:27:19.963+00	2026-04-22 08:27:19.963+00	\N	livekit	\N	\N
570743cc-c333-405f-90d4-b09db02883fb	31ffd921-762f-4f0c-8350-c1abf5766703	920ef4e5-f1d7-4936-a255-41c2b3c65caf	Live Smoke	test	ended	2026-05-01 10:00:00+00	2026-05-01 11:00:00+00	2026-04-22 10:12:17.789+00	2026-04-22 10:12:18.046+00	50	aBHyDfg-6rVNDdsGejMjCrHz_9AYdICi	\N	2026-04-22 10:09:01.417611+00	2026-04-22 10:12:18.046+00	\N	livekit	\N	\N
8637d8c1-e75f-4ed8-9bae-f912d15846e3	0eaca86d-f35f-40ca-a053-3a83f27acc9c	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	New Yojna Prachar	sdff	ended	2026-04-26 03:30:00+00	2026-04-26 11:30:00+00	2026-05-04 10:13:25.587+00	2026-05-04 10:13:46.967+00	\N	mJ8S2OAjloYrbpDuZycr2WwyAWMB2buQ	\N	2026-04-21 11:24:33.064584+00	2026-05-04 10:13:46.967+00	\N	livekit	\N	\N
5a21c8a9-acb0-42f4-adcc-dd01cd36f60b	0eaca86d-f35f-40ca-a053-3a83f27acc9c	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	Finance Mela	Finanace mela in Telgaon, Maharashtara.	ended	2026-05-15 03:30:00+00	2026-05-14 18:30:00+00	2026-05-14 12:16:01.713+00	2026-05-14 12:19:53.59+00	3	tPGnoZis6RVndsq8xLYxcG96iWcXeLuD	\N	2026-05-14 12:15:39.682245+00	2026-05-14 12:19:53.59+00	\N	livekit	\N	\N
3d7f71e3-ff20-4638-8a6c-09c80017d89f	07c26e07-6c51-421f-960d-dfc15dd063a5	8cb0404c-713f-4324-bc60-fbb7b3d3716c	Smoke Test Room	e2e flow test	ended	2026-05-04 18:00:00+00	2026-05-04 20:00:00+00	2026-05-04 12:22:03.277+00	2026-05-04 12:23:31.923+00	\N	-ovNxNVR8IJYKIlwnstt2ekIXsrlSVJk	\N	2026-05-04 12:21:44.491922+00	2026-05-04 12:23:31.923+00	\N	livekit	\N	\N
5ed559b8-a4d6-4017-871e-c953c0aa8df3	0eaca86d-f35f-40ca-a053-3a83f27acc9c	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	Test Event	\N	ended	2026-05-09 03:30:00+00	2026-05-09 05:30:00+00	2026-05-14 10:50:21.595+00	2026-05-14 10:51:37.402+00	\N	Nq2N3ULo2E4es6thpsmYCdkK1wqjHuvI	\N	2026-05-08 14:22:49.02273+00	2026-05-14 10:51:37.402+00	\N	livekit	\N	\N
\.


--
-- Data for Name: form_definitions; Type: TABLE DATA; Schema: public; Owner: evently_admin
--

COPY public.form_definitions (id, room_id, version, fields, created_at, updated_at) FROM stdin;
aa44a219-33bf-4151-935f-7d31ccfe7d65	dcdd399d-f965-4bc6-9a89-0cd9750f9c34	1	[{"id": "name", "type": "text", "label": "Full Name", "required": true}, {"id": "email", "type": "email", "label": "Email", "required": true}]	2026-04-22 07:15:05.050629+00	2026-04-22 07:15:05.050629+00
f1dbf14b-910e-4d99-a632-b19d1f04f072	dcdd399d-f965-4bc6-9a89-0cd9750f9c34	2	[{"id": "name", "type": "text", "label": "Full Name", "required": true}, {"id": "email", "type": "email", "label": "Email", "required": true}, {"id": "phone", "type": "phone", "label": "Mobile", "required": false}]	2026-04-22 07:15:05.241815+00	2026-04-22 07:15:05.241815+00
ce11af1e-de3f-46ff-9b20-aa99fdac559d	785117a5-ea35-414d-8ad0-4740e3ddb550	1	[{"id": "name", "type": "text", "label": "Name", "required": true}, {"id": "email", "type": "email", "label": "Email", "required": true}, {"id": "phone", "type": "phone", "label": "Phone", "required": false}, {"id": "age", "type": "number", "label": "Age", "required": false}, {"id": "gender", "type": "select", "label": "Gender", "options": ["male", "female", "other"], "required": false}, {"id": "agree", "type": "checkbox", "label": "Agree", "required": true}]	2026-04-22 08:13:32.852854+00	2026-04-22 08:13:32.852854+00
b4766b8a-3bf6-4815-8724-50489cbe95ea	753b2d11-63c0-4e40-ae3b-f6f9c3e76bc2	1	[{"id": "name", "type": "text", "label": "Name", "required": true}, {"id": "email", "type": "email", "label": "Email", "required": true}, {"id": "gender", "type": "select", "label": "Gender", "options": ["male", "female", "other"], "required": false}]	2026-04-22 08:26:58.261888+00	2026-04-22 08:26:58.261888+00
4dd6124c-8399-4206-9deb-51a479398180	d9bb5476-d170-40f6-9e52-034ffa536d1b	1	[{"id": "n", "type": "text", "label": "N", "required": true}]	2026-04-22 08:27:20.534875+00	2026-04-22 08:27:20.534875+00
3f2a1fb1-3183-4e59-b71c-237da18d46fa	8637d8c1-e75f-4ed8-9bae-f912d15846e3	1	[{"id": "1bsoz37j", "type": "text", "label": "New text field", "required": false}, {"id": "enl6kk6u", "type": "email", "label": "New email field", "required": false}, {"id": "axa1zbh1", "type": "phone", "label": "New phone field", "required": false}, {"id": "69xtra6s", "type": "number", "label": "New number field", "required": false}, {"id": "qdwsmmym", "type": "select", "label": "New select field", "options": ["Option 1"], "required": false}, {"id": "z08jc97r", "type": "checkbox", "label": "New checkbox field", "required": false}]	2026-04-22 08:51:15.74899+00	2026-04-22 08:51:15.74899+00
b8af1ff1-50d6-41a9-8fd4-1980d58dd913	8637d8c1-e75f-4ed8-9bae-f912d15846e3	2	[{"id": "1bsoz37j", "type": "text", "label": "Name", "required": true}, {"id": "enl6kk6u", "type": "email", "label": "Email", "required": false}, {"id": "axa1zbh1", "type": "phone", "label": "Mobile Number", "required": true}, {"id": "69xtra6s", "type": "number", "label": "Aadhar Number", "required": true}, {"id": "qdwsmmym", "type": "number", "label": "Khasra Number", "required": true}, {"id": "z08jc97r", "type": "text", "label": "Address (Village)", "required": true}]	2026-04-22 09:05:48.524381+00	2026-04-22 09:05:48.524381+00
1c2f4936-f376-4558-8dd6-6776b07fb9e7	3d7f71e3-ff20-4638-8a6c-09c80017d89f	1	[{"id": "name", "type": "text", "label": "Full Name", "required": true}, {"id": "email", "type": "email", "label": "Email", "required": true}, {"id": "role", "type": "select", "label": "Role", "options": ["Engineer", "Designer", "PM"], "required": true}]	2026-05-04 12:21:55.405321+00	2026-05-04 12:21:55.405321+00
c9f612bb-9ec7-4bb6-afd4-086b638c943d	5ed559b8-a4d6-4017-871e-c953c0aa8df3	1	[{"id": "hortvbxu", "type": "text", "label": "Name", "required": true}, {"id": "kus49x39", "type": "email", "label": "Email", "required": true}, {"id": "yt63vmmo", "type": "phone", "label": "Mobile", "required": true}]	2026-05-08 14:24:22.599496+00	2026-05-08 14:24:22.599496+00
087620cf-d5c3-4b60-a2eb-482ba6c43e64	5a21c8a9-acb0-42f4-adcc-dd01cd36f60b	1	[{"id": "8g3ffy67", "type": "text", "label": "New text field", "required": false}, {"id": "buz4hs71", "type": "email", "label": "New email field", "required": false}, {"id": "cskic1ia", "type": "phone", "label": "New phone field", "required": false}, {"id": "9dfdv89s", "type": "select", "label": "Gender", "options": ["Male"], "required": true}]	2026-05-14 12:17:04.077546+00	2026-05-14 12:17:04.077546+00
eef3e552-7b59-441d-b4ab-406ed95455bf	5a21c8a9-acb0-42f4-adcc-dd01cd36f60b	2	[{"id": "8g3ffy67", "type": "text", "label": "New text field", "required": false}, {"id": "buz4hs71", "type": "email", "label": "New email field", "required": false}, {"id": "cskic1ia", "type": "phone", "label": "New phone field", "required": false}, {"id": "9dfdv89s", "type": "select", "label": "Gender", "options": ["Male"], "required": true}]	2026-05-14 12:17:23.930338+00	2026-05-14 12:17:23.930338+00
bcabfba4-ab6d-45a8-80e7-ccfa3ca45317	5a21c8a9-acb0-42f4-adcc-dd01cd36f60b	3	[{"id": "8g3ffy67", "type": "text", "label": "Name", "required": true}, {"id": "buz4hs71", "type": "email", "label": "New email field", "required": true}, {"id": "cskic1ia", "type": "phone", "label": "New phone field", "required": true}, {"id": "9dfdv89s", "type": "select", "label": "Gender", "options": ["Male"], "required": true}, {"id": "fipbo88u", "type": "number", "label": "New number field", "required": false}]	2026-05-14 12:17:54.522991+00	2026-05-14 12:17:54.522991+00
\.


--
-- Data for Name: org_members; Type: TABLE DATA; Schema: public; Owner: evently_admin
--

COPY public.org_members (id, user_id, organization_id, role, invited_by, joined_at, created_at, updated_at) FROM stdin;
867c7b67-9829-45d0-a144-e0052f5d1db0	00a60c59-8318-4b0a-82b8-a9eae0725263	7e7b113c-9317-4e88-a3cb-b4d3d01aaa88	event_admin	\N	2026-04-16 12:46:43.300684+00	2026-04-16 12:46:43.300684+00	2026-04-16 12:46:43.300684+00
9cf6d1fa-3dd7-48b4-af29-272be147b29a	35853014-975c-4484-96af-2d36060ab46c	fddb472b-0bb3-4a8a-b8c8-94d947981ae2	event_admin	\N	2026-04-17 09:51:55.216663+00	2026-04-17 09:51:55.216663+00	2026-04-17 09:51:55.216663+00
b1e758ec-b7e7-41a6-9629-f8a54fd42daa	10341386-c4c5-4e08-8421-f65264d31f66	c9a87df1-36b6-45b1-9719-d6c0149b0465	event_admin	\N	2026-04-17 11:43:21.723229+00	2026-04-17 11:43:21.723229+00	2026-04-17 11:43:21.723229+00
89d4367d-c277-45ae-b8a8-b504bb8524f4	ad4442fc-859e-4f49-9df6-d567a2aac76e	33547869-8c58-49ae-8770-c939b035a765	event_admin	\N	2026-04-17 11:44:35.265931+00	2026-04-17 11:44:35.265931+00	2026-04-17 11:44:35.265931+00
64eaa47e-4d78-4391-872b-4eb4e9db0c4d	3079a8cf-4016-4bde-b406-2806ec9da7ec	39439ece-1a9e-4090-9662-eb5edb725e93	event_admin	\N	2026-04-17 11:48:13.768938+00	2026-04-17 11:48:13.768938+00	2026-04-17 11:48:13.768938+00
a206134c-7187-4702-b4bb-ad3c346420c3	7d80b259-8db9-4a9d-ad25-330671afbe00	b3044578-71ec-4be3-bbd5-ae9a03b91eda	event_admin	\N	2026-04-21 08:29:07.785698+00	2026-04-21 08:29:07.785698+00	2026-04-21 08:29:07.785698+00
597bf42a-1609-4bde-aed6-111848d78e4b	60340164-96f8-4061-ab2b-3880392c8333	de0bcbec-788f-4d15-b0a2-1b820890b489	event_admin	\N	2026-04-21 09:59:27.034608+00	2026-04-21 09:59:27.034608+00	2026-04-21 09:59:27.034608+00
340ff94f-4ec7-4d56-b8d5-056d560d46e0	9cc8a327-e787-45c0-8e6a-99cc156d6d20	ca2ae2ed-629c-4776-838d-926d02a4a0bd	event_admin	\N	2026-04-21 10:01:05.885381+00	2026-04-21 10:01:05.885381+00	2026-04-21 10:01:05.885381+00
54333e07-bfd3-42c2-a76f-57adab7f6de5	42f6f938-b10e-40b9-845e-c6a8cd85bdd3	58abeea3-1d6c-4849-b745-4c9532b902f4	event_admin	\N	2026-04-21 10:01:08.459738+00	2026-04-21 10:01:08.459738+00	2026-04-21 10:01:08.459738+00
c2a0feb3-1f87-45fe-9b75-3a19631490d4	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	0eaca86d-f35f-40ca-a053-3a83f27acc9c	event_admin	\N	2026-04-21 11:22:14.915155+00	2026-04-21 11:22:14.915155+00	2026-04-21 11:22:14.915155+00
978ce498-6ce5-4718-9a66-f22280e10472	c9960695-698b-47f5-90a8-412ce0283b25	173b75a1-7340-431f-898d-4407842ca54d	event_admin	\N	2026-04-21 14:00:51.709328+00	2026-04-21 14:00:51.709328+00	2026-04-21 14:00:51.709328+00
f74e0999-4a2d-4ed6-a06c-87299bc4249b	b12d4fd3-5d67-4162-b5b2-1d70cf5b6a06	80729e7c-33bb-4ea4-aebe-3f2a4a8e49f1	event_admin	\N	2026-04-21 14:02:12.514169+00	2026-04-21 14:02:12.514169+00	2026-04-21 14:02:12.514169+00
69415fa8-ddc7-4624-a444-45b297a7a892	1bddbac9-816f-48a2-9d7f-da1bb2ab7abc	0448a2ca-fe5c-48b0-b7a2-d8107f40e4c7	event_admin	\N	2026-04-21 14:02:35.757581+00	2026-04-21 14:02:35.757581+00	2026-04-21 14:02:35.757581+00
013f40b6-dfdf-43dd-8b4d-fa9bddeada36	55dd435c-c23c-4057-b95d-71d140b3833f	026400d2-3503-49ad-92bb-5c139e975b86	event_admin	\N	2026-04-22 06:57:46.762378+00	2026-04-22 06:57:46.762378+00	2026-04-22 06:57:46.762378+00
be31f81a-bb06-4fcb-ac14-cfac89e8b53a	fa105022-2d94-4e86-a70f-73c693c77c1c	f659de33-7c8b-415a-8ad1-619a06cb4ada	event_admin	\N	2026-04-22 06:57:47.512822+00	2026-04-22 06:57:47.512822+00	2026-04-22 06:57:47.512822+00
24742635-8dd6-4184-839c-496e98978bde	37cca90e-1105-4add-9336-5064497ca7bc	ac0e8778-f130-438b-9e8d-cfc9ea2a63d2	event_admin	\N	2026-04-22 07:15:03.370053+00	2026-04-22 07:15:03.370053+00	2026-04-22 07:15:03.370053+00
ea936375-9bf8-4225-a1ff-3d01b323d7dc	97c4cdfe-3e71-43c6-a8f5-0701d7054709	5576afed-5f14-4883-90e2-29bdad009e44	event_admin	\N	2026-04-22 07:15:04.052154+00	2026-04-22 07:15:04.052154+00	2026-04-22 07:15:04.052154+00
119ecafb-fa5a-44d5-a477-302d86775014	43a4306b-44e2-4ff1-9655-5e561ec8e42d	013f0291-44c7-4cf9-b9ac-12476cb17cb7	event_admin	\N	2026-04-22 08:13:31.560016+00	2026-04-22 08:13:31.560016+00	2026-04-22 08:13:31.560016+00
a2d7bf98-62cc-45b8-bdba-103bf662dfba	fc29a092-b21f-4f3e-8282-b9d7dc1bd050	78e2e21b-21f9-4335-acbb-7dc3f727d6c9	event_admin	\N	2026-04-22 08:16:11.315058+00	2026-04-22 08:16:11.315058+00	2026-04-22 08:16:11.315058+00
a82e46f6-3f81-441d-99bf-673e7ffb7a37	b3897f61-81d0-424d-bf0c-74451aedab60	8c56cf26-daae-4ea5-9888-c4e09a2520a5	event_admin	\N	2026-04-22 08:23:48.322173+00	2026-04-22 08:23:48.322173+00	2026-04-22 08:23:48.322173+00
2ffc9b3f-3032-47a4-9501-4bcbf75a9593	326b6978-cad0-40c3-aec2-843b07cdf604	6960c594-66f5-49e1-ae37-95f833033a8b	event_admin	\N	2026-04-22 08:24:41.968257+00	2026-04-22 08:24:41.968257+00	2026-04-22 08:24:41.968257+00
47728ab3-daec-4acf-86d0-679c369f7d66	d5bc7a16-948b-48e4-8ec6-3773b5bb6ebf	bea42115-eafd-48cb-a060-aa94829b9638	event_admin	\N	2026-04-22 08:25:24.748681+00	2026-04-22 08:25:24.748681+00	2026-04-22 08:25:24.748681+00
20e6ea0a-0e0f-45dc-b91f-30c7cb335871	57cbd3a8-4b76-4ac9-8f27-ae2ddf3fcdb9	96c1800f-e33f-49f4-b423-bc2957bbfa38	event_admin	\N	2026-04-22 08:26:14.538707+00	2026-04-22 08:26:14.538707+00	2026-04-22 08:26:14.538707+00
815a5940-d13e-4611-b3bd-38bbdc71e234	21ee6fbf-1ab1-4aa1-90ca-7265775e77de	5fa21644-8e2c-4a1d-be21-fd446905dd86	event_admin	\N	2026-04-22 08:26:56.372987+00	2026-04-22 08:26:56.372987+00	2026-04-22 08:26:56.372987+00
f47f8026-a9bb-40f3-83c9-0897bb754aa6	7822732e-4ec5-4499-b3b5-f790dcf70d4b	03a3e9d4-ff6e-431a-b468-c21a806f8a5a	event_admin	\N	2026-04-22 08:27:19.323012+00	2026-04-22 08:27:19.323012+00	2026-04-22 08:27:19.323012+00
5b1973cf-6b9f-4ede-801d-fae3d025468c	920ef4e5-f1d7-4936-a255-41c2b3c65caf	31ffd921-762f-4f0c-8350-c1abf5766703	event_admin	\N	2026-04-22 10:08:46.942406+00	2026-04-22 10:08:46.942406+00	2026-04-22 10:08:46.942406+00
69fd0811-39ef-4bb8-bbe2-b249438d9246	8cb0404c-713f-4324-bc60-fbb7b3d3716c	07c26e07-6c51-421f-960d-dfc15dd063a5	event_admin	\N	2026-05-04 12:21:36.038728+00	2026-05-04 12:21:36.038728+00	2026-05-04 12:21:36.038728+00
1d8df14c-4e64-401a-8dea-7c6c173a19bb	9c4bc36a-2d54-420f-8236-cb493c0a81dc	d29d2db3-6a4f-46f8-9c8e-561231db73e2	event_admin	\N	2026-05-15 10:43:14.273951+00	2026-05-15 10:43:14.273951+00	2026-05-15 10:43:14.273951+00
7304178b-b4de-4144-b2fd-857b9a79ad60	20dd9754-1ad3-48e7-836f-6eb0c503ed2e	580c3eb2-d21f-4351-98dd-1561b708f83c	event_admin	\N	2026-05-15 11:23:58.775117+00	2026-05-15 11:23:58.775117+00	2026-05-15 11:23:58.775117+00
\.


--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: evently_admin
--

COPY public.organizations (id, name, slug, description, logo_url, website_url, contact_email, is_active, created_at, updated_at, deleted_at) FROM stdin;
7e7b113c-9317-4e88-a3cb-b4d3d01aaa88	Test NGO	test-ngo-ju0imz	\N	\N	\N	admin@ngo.org	t	2026-04-16 12:46:43.300684+00	2026-04-16 12:46:43.300684+00	\N
fddb472b-0bb3-4a8a-b8c8-94d947981ae2	CaveOrg	caveorg-wijgth	\N	\N	\N	caveman@test.com	t	2026-04-17 09:51:55.216663+00	2026-04-17 09:51:55.216663+00	\N
c9a87df1-36b6-45b1-9719-d6c0149b0465	Sprint Org	sprint-org-fvgj_c	\N	\N	\N	s1test+1776426201@example.com	t	2026-04-17 11:43:21.723229+00	2026-04-17 11:43:21.723229+00	\N
33547869-8c58-49ae-8770-c939b035a765	Other Org Inc	other-org-inc-8x3son	\N	\N	\N	s1test-other+1776426273@example.com	t	2026-04-17 11:44:35.265931+00	2026-04-17 11:44:35.265931+00	\N
39439ece-1a9e-4090-9662-eb5edb725e93	Ship Org	ship-org-ibk22q	\N	\N	\N	ship+1776426492@example.com	t	2026-04-17 11:48:13.768938+00	2026-04-17 11:48:13.768938+00	\N
b3044578-71ec-4be3-bbd5-ae9a03b91eda	Main Org	main-org-8nnpwg	\N	\N	\N	main-smoke+1776760146@example.com	t	2026-04-21 08:29:07.785698+00	2026-04-21 08:29:07.785698+00	\N
de0bcbec-788f-4d15-b0a2-1b820890b489	Acme NGO	acme-ngo-fetsne	\N	\N	\N	pm+1776765562@test.io	t	2026-04-21 09:59:27.034608+00	2026-04-21 09:59:27.034608+00	\N
ca2ae2ed-629c-4776-838d-926d02a4a0bd	Org A	org-a-idb-pi	\N	\N	\N	a+1776765663@test.io	t	2026-04-21 10:01:05.885381+00	2026-04-21 10:01:05.885381+00	\N
58abeea3-1d6c-4849-b745-4c9532b902f4	Org B	org-b-fvqzgw	\N	\N	\N	b+1776765663@test.io	t	2026-04-21 10:01:08.459738+00	2026-04-21 10:01:08.459738+00	\N
0eaca86d-f35f-40ca-a053-3a83f27acc9c	Agriclick	agriclick-rkjnj_	\N	\N	\N	upvedanaturals@gmail.com	t	2026-04-21 11:22:14.915155+00	2026-04-21 11:22:14.915155+00	\N
173b75a1-7340-431f-898d-4407842ca54d	YT Org	yt-org-wzwiht	\N	\N	\N	yt-admin-1776780049@test.com	t	2026-04-21 14:00:51.709328+00	2026-04-21 14:00:51.709328+00	\N
80729e7c-33bb-4ea4-aebe-3f2a4a8e49f1	YT Org	yt-org-eqjja4	\N	\N	\N	yt-1776780131@test.com	t	2026-04-21 14:02:12.514169+00	2026-04-21 14:02:12.514169+00	\N
0448a2ca-fe5c-48b0-b7a2-d8107f40e4c7	YT Org	yt-org-lqutp1	\N	\N	\N	yt-admin-1776780154@test.com	t	2026-04-21 14:02:35.757581+00	2026-04-21 14:02:35.757581+00	\N
026400d2-3503-49ad-92bb-5c139e975b86	OrgA	orga-irc676	\N	\N	\N	forma-1776841066@test.com	t	2026-04-22 06:57:46.762378+00	2026-04-22 06:57:46.762378+00	\N
f659de33-7c8b-415a-8ad1-619a06cb4ada	OrgB	orgb-oi6qao	\N	\N	\N	formb-1776841066@test.com	t	2026-04-22 06:57:47.512822+00	2026-04-22 06:57:47.512822+00	\N
ac0e8778-f130-438b-9e8d-cfc9ea2a63d2	OrgA	orga-2ll2gn	\N	\N	\N	forma-1776842102@test.com	t	2026-04-22 07:15:03.370053+00	2026-04-22 07:15:03.370053+00	\N
5576afed-5f14-4883-90e2-29bdad009e44	OrgB	orgb-zubc45	\N	\N	\N	formb-1776842102@test.com	t	2026-04-22 07:15:04.052154+00	2026-04-22 07:15:04.052154+00	\N
013f0291-44c7-4cf9-b9ac-12476cb17cb7	OrgA	orga-kjwwps	\N	\N	\N	att-1776845610@test.com	t	2026-04-22 08:13:31.560016+00	2026-04-22 08:13:31.560016+00	\N
78e2e21b-21f9-4335-acbb-7dc3f727d6c9	OrgA	orga-tujfak	\N	\N	\N	att2-1776845770@test.com	t	2026-04-22 08:16:11.315058+00	2026-04-22 08:16:11.315058+00	\N
8c56cf26-daae-4ea5-9888-c4e09a2520a5	OrgA	orga-hvh2ol	\N	\N	\N	att3-1776846227@test.com	t	2026-04-22 08:23:48.322173+00	2026-04-22 08:23:48.322173+00	\N
6960c594-66f5-49e1-ae37-95f833033a8b	OrgA	orga-vquiye	\N	\N	\N	att4-1776846281@test.com	t	2026-04-22 08:24:41.968257+00	2026-04-22 08:24:41.968257+00	\N
bea42115-eafd-48cb-a060-aa94829b9638	OrgA	orga-wyhg4r	\N	\N	\N	att5-1776846324@test.com	t	2026-04-22 08:25:24.748681+00	2026-04-22 08:25:24.748681+00	\N
96c1800f-e33f-49f4-b423-bc2957bbfa38	OrgA	orga-_at0su	\N	\N	\N	att6-1776846374@test.com	t	2026-04-22 08:26:14.538707+00	2026-04-22 08:26:14.538707+00	\N
5fa21644-8e2c-4a1d-be21-fd446905dd86	OrgA	orga-hvdcg0	\N	\N	\N	full-1776846415@test.com	t	2026-04-22 08:26:56.372987+00	2026-04-22 08:26:56.372987+00	\N
03a3e9d4-ff6e-431a-b468-c21a806f8a5a	OrgA	orga-odhgew	\N	\N	\N	list-1776846438@test.com	t	2026-04-22 08:27:19.323012+00	2026-04-22 08:27:19.323012+00	\N
31ffd921-762f-4f0c-8350-c1abf5766703	LiveOrg 1776852526	liveorg-1776852526-rw9j1u	\N	\N	\N	live-1776852526@test.com	t	2026-04-22 10:08:46.942406+00	2026-04-22 10:08:46.942406+00	\N
07c26e07-6c51-421f-960d-dfc15dd063a5	SmokeOrg	smokeorg-rnyx_w	\N	\N	\N	smoketest+1777897289@evently.dev	t	2026-05-04 12:21:36.038728+00	2026-05-04 12:21:36.038728+00	\N
d29d2db3-6a4f-46f8-9c8e-561231db73e2	UNFPCL	unfpcl-sdllha	\N	\N	\N	nextventures.ecs@gmail.com	t	2026-05-15 10:43:14.273951+00	2026-05-15 10:43:14.273951+00	\N
580c3eb2-d21f-4351-98dd-1561b708f83c	Prathm Foundation	prathm-foundation-5-jx_n	\N	\N	\N	pj@gmail.com	t	2026-05-15 11:23:58.775117+00	2026-05-15 11:23:58.775117+00	\N
\.


--
-- Data for Name: room_recordings; Type: TABLE DATA; Schema: public; Owner: evently_admin
--

COPY public.room_recordings (id, room_id, status, egress_id, s3_key, mime_type, size_bytes, started_at, ended_at, error, created_at) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: evently_admin
--

COPY public.sessions (id, user_id, token_hash, family_id, replaced_by_id, user_agent, ip_address, expires_at, revoked_at, created_at) FROM stdin;
8e8824e3-33db-4408-b663-5641a5163f60	00a60c59-8318-4b0a-82b8-a9eae0725263	8e78b78952db74f72c4a21c1a01adac8d6aa02584447596b2b354a72ce73bce4	73e53559-280b-449f-b3d5-de427214eeae	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-23 12:46:43.348+00	\N	2026-04-16 12:46:43.351333+00
7ecc0b0e-9d34-43a7-a592-8df261ac4bbf	00a60c59-8318-4b0a-82b8-a9eae0725263	718d6616a9caeca7cac474534c5c5cea7173113f4e141d2246948ec69ff3d12d	71847493-f80a-4577-9bfc-7c3011e7cd39	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-23 12:46:44.461+00	\N	2026-04-16 12:46:44.46305+00
e2901640-d497-4774-957d-907f031821e3	00a60c59-8318-4b0a-82b8-a9eae0725263	53c1c30a5abb7d94ffa68c6234debfbaa2ae1628d62d1c75ecccdd8a9e9cc0c8	75ddda17-5a95-47d7-967a-ebcf857fafc9	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-23 12:47:12.416+00	\N	2026-04-16 12:47:12.416883+00
709ace1e-d2f1-4ff7-8c7e-ba4d7cdad026	8acb1434-697f-4bb0-9fad-728069b65459	8e54fc6e706318f0d0617c11006a6252817bf595f374ed731fa25a6e00758f14	798ab144-09b2-48b2-bc5a-df1de20a7567	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-23 12:47:18.426+00	\N	2026-04-16 12:47:18.428086+00
c3b7789b-8a9f-448f-9721-68a977b825c1	00a60c59-8318-4b0a-82b8-a9eae0725263	66024b75863c6c614273a4da660bb08c38ac160d895c833e7c7f52bb1976a53d	a12ed842-545b-4b06-9837-19650d6492fb	0307e2cf-c92f-496c-8e72-749a9a7d1cc5	curl/8.17.0	::ffff:172.18.0.1	2026-04-23 12:47:20.054+00	2026-04-16 12:47:20.236+00	2026-04-16 12:47:20.055643+00
0307e2cf-c92f-496c-8e72-749a9a7d1cc5	00a60c59-8318-4b0a-82b8-a9eae0725263	1d8e146847669d308a78cad2bb6ca8b5caab42283c743c0d94ec4bcd93f9be5e	a12ed842-545b-4b06-9837-19650d6492fb	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-23 12:47:20.23+00	2026-04-16 12:47:20.419+00	2026-04-16 12:47:20.231662+00
c131745c-be01-4b19-b850-d9a0b6b7062f	35853014-975c-4484-96af-2d36060ab46c	eda2b9a7f989cb68334eeb7dd29be04154b2e8ee92039f47f8dd821942242cc9	d33014c1-4d1b-4ba1-9b14-dea4bc368b19	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 09:51:55.247+00	\N	2026-04-17 09:51:55.248108+00
fef872ca-73ca-4cac-a390-ec13c68842ab	35853014-975c-4484-96af-2d36060ab46c	0ed8509ffffe16ca9b082fc90d828ef13d4b5116ecdb32085bf7f2e69604b4b9	d621bee0-ff50-4ab2-93f4-14324a1ca271	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 09:53:43.117+00	\N	2026-04-17 09:53:43.118244+00
0a6162e8-c0f3-4e9b-b5ea-595485bcaf4a	35853014-975c-4484-96af-2d36060ab46c	a3ef41f80777e6df55e0e9b7c0f39be225265f87b3b61eaca6db8d1c5aafed2b	1ae10ea9-30fc-42dc-b9b5-2ec44df808f6	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 09:55:16.933+00	\N	2026-04-17 09:55:16.935639+00
6abe48a3-6981-4344-a962-d4da263a2399	10341386-c4c5-4e08-8421-f65264d31f66	4649ce891ede4bdd216b5ed7ac2671d96e73f99075d3231f3f85fd74308d8cf2	c9d18239-f622-45cf-b677-6e8bfe0af998	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 11:43:21.827+00	\N	2026-04-17 11:43:21.830332+00
3373aeeb-6b28-4f4a-acc2-ec950c14a46f	10341386-c4c5-4e08-8421-f65264d31f66	f8093a9aa92e9d1cfe191f44ae9f9a71b1e2a9d0fad847ea9865ef450e8cc011	8b53c48e-1dae-4754-ad13-52b5a653062d	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 11:43:40.224+00	\N	2026-04-17 11:43:40.226508+00
09e510b2-6025-48d6-913c-d2d71e7a1485	10341386-c4c5-4e08-8421-f65264d31f66	913193c2274180ce00e107905450db20e946781114b6c855ef9856fc39e72bc0	d92e4cbc-f20a-45cc-aec7-891cd932af9b	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 11:43:52.775+00	\N	2026-04-17 11:43:52.777338+00
6c4d6a32-56f3-4be9-9d07-04d783a5fb1d	10341386-c4c5-4e08-8421-f65264d31f66	0238a87bdafcb3354dfb5998de24f9c10b043d3670cd93cb28cee793b99670e2	fd7bec8b-a00d-4bdf-a514-69ba49b94f50	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 11:44:06.396+00	\N	2026-04-17 11:44:06.398549+00
bc593907-09a8-45f5-90cb-cd59d617a9df	10341386-c4c5-4e08-8421-f65264d31f66	448d512c9fb6fc1914e69a6e6f77f81ce3b0326e376c4430931323f8697f0081	bf2e9dc6-36aa-43c1-a0b0-d2811c4532ea	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 11:44:21.063+00	\N	2026-04-17 11:44:21.064786+00
a22c13bb-10e4-4353-9e07-1c45c3f8e204	ad4442fc-859e-4f49-9df6-d567a2aac76e	3d0dadb4722262f1a002366308ddf9c7b4a9a0af2d36a8b70e18d0db0bdd46ea	c9c92fe3-2b7c-46fd-ab83-38ec463a4bc6	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 11:44:35.283+00	\N	2026-04-17 11:44:35.284356+00
cc9bfd35-5bf1-4ed2-81ab-3fb46501b2da	10341386-c4c5-4e08-8421-f65264d31f66	639d0028f6fa22a385569b48fccc099547c57f1ff2189829b96fe02e14a77181	ca8834d5-a98d-4b3d-af3d-8f39c76dd4b7	dcdac41e-e6fa-498e-9392-ff6db7fc8189	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 11:44:49.515+00	2026-04-17 11:44:50.582+00	2026-04-17 11:44:49.517115+00
dcdac41e-e6fa-498e-9392-ff6db7fc8189	10341386-c4c5-4e08-8421-f65264d31f66	33230d88ea543c007cc5ff7dbc316138d2965065e1ad708aa155e31eee23482d	ca8834d5-a98d-4b3d-af3d-8f39c76dd4b7	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 11:44:50.569+00	2026-04-17 11:44:51.284+00	2026-04-17 11:44:50.570866+00
e443d06a-128d-420d-9606-e8a77d6fccb6	10341386-c4c5-4e08-8421-f65264d31f66	c962f4875001c60e3191a33a14052353f86ede8491453decae3c32ed9ce640a4	1889ab6b-fbd1-4533-8f83-e2c77020ae97	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 11:45:03.67+00	2026-04-17 11:45:04.164+00	2026-04-17 11:45:03.672323+00
b066b8c7-ab77-4aee-a17b-b76025f5306b	10341386-c4c5-4e08-8421-f65264d31f66	4369dbfefb6102b5b60445047bba384e96a4208a22bdc23fbc37e1bb6de13a5c	339eb7f1-b9ee-4a16-9abc-c63029a35654	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 11:45:17.049+00	\N	2026-04-17 11:45:17.051794+00
4f624b0f-cb37-485a-b27b-8f8f7d37d8ff	3079a8cf-4016-4bde-b406-2806ec9da7ec	d2262107ea4dd75cf62334df786ca475810f47d041ea41f27148ae0a96c88a04	8fa9f365-f306-4090-8f2f-1da0b3ee8ae2	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-24 11:48:13.807+00	\N	2026-04-17 11:48:13.809774+00
ad68efa3-c76d-47f1-bd83-c10edf5528d9	7d80b259-8db9-4a9d-ad25-330671afbe00	2118bbd2383aa4f580ed35bcb67d4cc23e4a96fcae96b4bfaa4fb64eaf268c19	5d8a1b71-7cbd-41b9-83c8-507134222a13	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 08:29:07.858+00	\N	2026-04-21 08:29:07.860624+00
cfeb26da-6f57-468b-8ff0-0edc2c976b22	60340164-96f8-4061-ab2b-3880392c8333	60ee86563b1a62b9dcf644d7f998128ccfb10019001cf51ac4e8c1ff75112a66	9dd50391-39db-47b1-b07c-e35979bd998f	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 09:59:27.073+00	\N	2026-04-21 09:59:27.075194+00
423f70e7-29cc-4b45-bc82-bfb0a7ec5909	60340164-96f8-4061-ab2b-3880392c8333	db3d2f133e218ed6d2dd7cdcea866311bfbd96c08775643da37bc5a03444aaf7	07af7cde-8047-432f-99be-2049d26b6054	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 09:59:31.156+00	\N	2026-04-21 09:59:31.157676+00
8be1d052-408e-4cc7-aa64-7ed8b90efa1d	9cc8a327-e787-45c0-8e6a-99cc156d6d20	ace47c190b424e255dca51b140e58eda8c9aa2a170323d607a89ca3e886e63e9	48a5caf4-d5cc-463a-8d57-8bc755fc04bc	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 10:01:06.658+00	\N	2026-04-21 10:01:06.659764+00
702c08b4-c1a3-44c2-b9d9-e00050f49aab	42f6f938-b10e-40b9-845e-c6a8cd85bdd3	f6364a0a96b19079147cd95cd50ea1bffe1c780da8031978a9f3410a64eccb90	82b2546a-3e90-497f-baff-d1e09ee521f6	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 10:01:08.47+00	\N	2026-04-21 10:01:08.471415+00
08b70136-dc97-4b2a-8093-24f9abc93d82	42f6f938-b10e-40b9-845e-c6a8cd85bdd3	7d97e7da51d2436c180a374c1f7819b3e04bb2cfd1f789a5eca450a84652677d	40aa84d1-034a-4f5c-bfa3-2b820a3b14aa	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 10:01:09.293+00	\N	2026-04-21 10:01:09.295033+00
7ab269c8-21e9-4b4a-bea3-48aad98d23b4	9cc8a327-e787-45c0-8e6a-99cc156d6d20	3c0d6ac67504c6d0d1d66f50a93e3628cd1d8dbce23268055f063281217fbe6b	61c14aff-619c-4111-913a-0534d48cf05d	a7eb9d23-7bed-47c0-8d79-8853ffc7a255	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 10:01:05.901+00	2026-04-21 10:01:13.172+00	2026-04-21 10:01:05.902021+00
a7eb9d23-7bed-47c0-8d79-8853ffc7a255	9cc8a327-e787-45c0-8e6a-99cc156d6d20	0bc4f72b31e1ce7c95fad05b075e39768e4c4baac3d8f1650dbc48118b9f6d3a	61c14aff-619c-4111-913a-0534d48cf05d	453ce63b-b0c7-48c0-9cf9-1fdf5496a701	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 10:01:13.166+00	2026-04-21 10:01:14.842+00	2026-04-21 10:01:13.168271+00
453ce63b-b0c7-48c0-9cf9-1fdf5496a701	9cc8a327-e787-45c0-8e6a-99cc156d6d20	14ccc743b3b0cc09cb542ff711130c3f1a9a419adfd453ae035134aebae92c48	61c14aff-619c-4111-913a-0534d48cf05d	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 10:01:14.837+00	2026-04-21 10:01:15.102+00	2026-04-21 10:01:14.838689+00
39c8f161-a35e-4ec6-8016-62e7965cf386	d62c5165-f707-463d-b1fe-5d16e9b42d93	b60424b3da06d46f1232a4759c1ac2de3985375d48f9ecaa16defdf071bebf30	e03a6f14-bce2-4d05-94e0-9fd851b2a471	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 10:01:15.822+00	\N	2026-04-21 10:01:15.823962+00
8f53bb00-6cbe-448d-b530-f5a0063dfbd6	d62c5165-f707-463d-b1fe-5d16e9b42d93	bf57992576aaa30d57bb17cd84a432588fdae7a8423b33ce453b04d52bcddd95	c5058366-1afd-40f9-b6b0-56f8e21741a9	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 10:01:16.484+00	\N	2026-04-21 10:01:16.485117+00
a2a751c9-9d91-423a-acef-c58aed8d4b98	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	a54cd90f105deff18043e07191da4676c960431163bfeeb30232edf209ad0fb2	f7eb8b5b-b52c-40d6-9017-e0a85b0ffa78	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-28 11:22:14.943+00	2026-04-21 11:25:02.69+00	2026-04-21 11:22:14.94449+00
2d1cf14c-a033-47e2-9ee3-7718d4d66f1c	c9960695-698b-47f5-90a8-412ce0283b25	770a9103c4c7c586c11a0ca318e6f68ac98b3ded0306e9f5b2d76c93d62f6e81	3088ca08-389e-493e-91a6-7177461a9122	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 14:00:51.742+00	\N	2026-04-21 14:00:51.74373+00
e1259000-96df-44ee-8822-b61008429b30	b12d4fd3-5d67-4162-b5b2-1d70cf5b6a06	232558f7aa81fde8d194312681f0222fc664b5d5306a69b1109dbdbdbd57284a	e9f5576c-b579-40cc-89e8-4aa983ee6b00	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 14:02:12.531+00	\N	2026-04-21 14:02:12.532853+00
c77497c7-4c6f-421a-858b-83697289f95a	1bddbac9-816f-48a2-9d7f-da1bb2ab7abc	792ef8e43151b12400ee4cd880cbe94cf680872fbfcbda2c079306cee89a82e3	4e69afea-b126-4b87-8be6-dae65f051abf	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-28 14:02:35.767+00	\N	2026-04-21 14:02:35.768557+00
5cc3f76a-2bf8-4ad9-8c7e-caa864361742	55dd435c-c23c-4057-b95d-71d140b3833f	97f721c27a18b5a80a93b056b0995e575bfb926938bc47759ffa8d6225640a37	dbfd5063-fb36-49b6-8b80-2aa7a36ccf56	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 06:57:46.796+00	\N	2026-04-22 06:57:46.79807+00
2eb70473-36f2-4948-99b7-e416d9f14fc7	fa105022-2d94-4e86-a70f-73c693c77c1c	7a33691df05480fa8d465c9b2f242b87261bae5721ad51fb39555a94e9845dc7	2380da6e-a766-449c-8326-168ebe37540b	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 06:57:47.529+00	\N	2026-04-22 06:57:47.530928+00
77dc9558-c581-4f0c-b81e-1e916d584dfe	37cca90e-1105-4add-9336-5064497ca7bc	d7be4cd035cf0e59780d4948426b5165fad9552a44fa6cf5172e20c22e2f6c27	cf9027e0-93eb-4795-9da1-8664dd8db5df	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 07:15:03.389+00	\N	2026-04-22 07:15:03.390057+00
35b12d90-384d-484f-b071-a20d67bb9339	97c4cdfe-3e71-43c6-a8f5-0701d7054709	05df2211472bb0016031a6132ad24f4512ad007a9a884fb2e7614fc13e166e6e	80ee8028-e661-4611-8520-c0b337d0a6bb	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 07:15:04.066+00	\N	2026-04-22 07:15:04.066906+00
24971de7-6c31-48ea-970f-920bd4103bc6	43a4306b-44e2-4ff1-9655-5e561ec8e42d	50f87c2fb395e6eb478a89b547ec348596c2c4f969c4b0d172baac562361c8e9	c75b47d1-9a70-455f-93ba-d4bc95ce2a41	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 08:13:31.583+00	\N	2026-04-22 08:13:31.585228+00
2007f05f-26af-4501-b718-27e0c0185765	fc29a092-b21f-4f3e-8282-b9d7dc1bd050	36aa9d996a23b1d8fac9bf0e3102fb8ce3497481a764183c96b84b3f7f8cd6f3	f0f80eeb-def6-4875-b13c-4cd6002b3e26	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 08:16:11.332+00	\N	2026-04-22 08:16:11.33338+00
6f5bc263-123e-42bc-a93d-88e4df1894f8	b3897f61-81d0-424d-bf0c-74451aedab60	bf3043cc7cc8eaee99534aa243b7354b1b7f3fdc4f7f8aa6d3fe33f21830eb38	c5f08fbd-31de-4852-bdef-aaedd6383094	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 08:23:48.35+00	\N	2026-04-22 08:23:48.352158+00
f673c586-099d-442a-b184-c9244ccb4083	326b6978-cad0-40c3-aec2-843b07cdf604	0734a64967ddb8be4ecda1e986fa1ffd179d3057c590c341f91296800624c1b8	1351cacd-2597-482c-a703-6011d818d7f3	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 08:24:41.983+00	\N	2026-04-22 08:24:41.983886+00
9c466092-f4fb-42bb-a83a-119b84967733	d5bc7a16-948b-48e4-8ec6-3773b5bb6ebf	b590f1fd0fdcd719ee28419c5b8a7097553b8c917165252944473957f80cf335	119eb49e-7a41-41c5-9c13-f1db3bc91ef8	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 08:25:24.758+00	\N	2026-04-22 08:25:24.759481+00
4364ccc8-a24e-400f-bf4f-4eec342d7a11	57cbd3a8-4b76-4ac9-8f27-ae2ddf3fcdb9	181e7afc6bdfdb35e91d3bfe998b234b0aca5c96f88b8c567ddb8c26b9c67e9c	6bf207be-d9d5-4127-9369-32a33ae045a6	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 08:26:14.557+00	\N	2026-04-22 08:26:14.559044+00
f510b117-0517-4cf2-b048-a3265be04ae4	21ee6fbf-1ab1-4aa1-90ca-7265775e77de	c51f45241cb4a4e482f3f33349dc8942b6964b9221934579b912161ced899ff0	f611ccb3-e346-440b-9448-5f43878e5875	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 08:26:56.385+00	\N	2026-04-22 08:26:56.386312+00
18edff6e-0196-418a-b240-038e418ed761	7822732e-4ec5-4499-b3b5-f790dcf70d4b	9562445a789f40f4442811544e8a11f55a40c71db702b812c9d74ce8b09e512c	9b86e576-1822-4f64-911e-951e9b297ae9	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 08:27:19.334+00	\N	2026-04-22 08:27:19.335714+00
0081b797-dcb4-4906-af88-ca48f6380921	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	28571e35b5f4b637d43684dc24671c0e399205be09f691121544bd360e50d29d	16241b31-a711-4be5-a220-1ff2f2c58dac	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 08:50:33.809+00	2026-04-22 08:50:53.495+00	2026-04-22 08:50:33.810217+00
9593e2dd-4ce2-4bb0-86d6-546f420f3e7e	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	2f8355b78b15f3c9254bd6ff411edbb5ac0f26ef855d8df692164c1f59b12b3e	83bd61e8-2575-44af-9ade-06c1c7e4aeed	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 08:50:56.155+00	2026-04-22 08:51:35.626+00	2026-04-22 08:50:56.15674+00
cfb55d7b-fa63-4e44-a544-24bb2905f649	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	2659846788cdb4f723f61b7c7f9ee3572535f8a2212f570fb25ae5bb33b35c4c	bff2cf09-35a9-4cb0-aaf3-333445945360	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 08:59:28.076+00	2026-04-22 09:06:23.32+00	2026-04-22 08:59:28.078456+00
044394f8-0c5a-40b5-8298-5c01807f595f	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	193df116d74362cde99d8498ac0bdb787b5ad9bc9943fb10cd75c9d0debefeed	a6011021-3518-4bf6-a973-18cac0359caf	c0099671-59c1-4cef-9d5f-fd548560e9bb	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 09:27:02.566+00	2026-04-22 09:27:32.764+00	2026-04-22 09:27:02.567382+00
c0099671-59c1-4cef-9d5f-fd548560e9bb	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	e0b25cc4531b12ce08123bbd08618e3c1f8fcc80d7185a333badf57cbdcb64a0	a6011021-3518-4bf6-a973-18cac0359caf	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 09:27:32.76+00	2026-04-22 09:27:38.023+00	2026-04-22 09:27:32.760854+00
cf25e031-fbae-448d-b5c2-e31d2b028200	920ef4e5-f1d7-4936-a255-41c2b3c65caf	8ff83f1045e56c95707cbfe2499f8972ae46e35ad1129dbc13c86f0e77c343ed	e449c877-509c-4518-b494-ee477fce79ad	\N	curl/8.17.0	::ffff:172.18.0.1	2026-04-29 10:08:46.994+00	\N	2026-04-22 10:08:46.996202+00
a107145a-ca40-40a2-b230-c9f775e7c15e	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	61c1c44a79304526b81b6d412062bb01450bf4712ab50b04e0d9bdd7746fc972	e03f3970-81fa-458a-a1ef-59b98b9e45a0	1350aebb-19f0-4a03-b1e6-c0f11c9ec236	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 10:27:31.747+00	2026-04-22 10:27:43.554+00	2026-04-22 10:27:31.765036+00
1350aebb-19f0-4a03-b1e6-c0f11c9ec236	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	794a444070a5023153ca7c58788da0fbdbc4fbc52c9f22a1987d0767f37e5fcd	e03f3970-81fa-458a-a1ef-59b98b9e45a0	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 10:27:43.535+00	2026-04-22 10:28:16.104+00	2026-04-22 10:27:43.544971+00
8b15dfc9-e80e-4bf4-9fa7-624b2b6d915d	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	a7374405022b1b86221c64137e1843ec6694eda51fa6501c8e27fda7bbd6137c	ddaa82c1-5cb8-474e-9627-50dadd8a2bb4	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 10:28:20.886+00	2026-04-22 10:30:53.814+00	2026-04-22 10:28:20.890971+00
69f0c289-8eac-4428-b7ff-3face2794a0c	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	d74d4cb95d0a784153570a59bc4ca6638a55bc17aae11ef9f48a2b55480f8756	397cc05b-eed6-42c0-82b5-245dac3176a9	072ebd30-da64-4dab-80ac-0ed483dcc1a0	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 12:19:44.267+00	2026-04-22 14:15:02.514+00	2026-04-22 12:19:44.278093+00
072ebd30-da64-4dab-80ac-0ed483dcc1a0	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	8c02656cddb1ab2bedd033c356b3f4583f46e2e5b635f7d752e0aab920ab5ee4	397cc05b-eed6-42c0-82b5-245dac3176a9	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:15:02.497+00	2026-04-22 14:15:04.543+00	2026-04-22 14:15:02.499309+00
6fa80ea6-2489-43c7-923c-0eb5bd619160	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	c18a6aa467cf2739af5ec8062349e464a0394c9c21409bf011e2fb2919ce6121	13df7a05-ba86-4116-9681-18bc34b6288c	1c4eb4f8-0169-448d-82e4-60a7319ac2ef	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:15:17.826+00	2026-04-22 14:15:22.174+00	2026-04-22 14:15:17.827589+00
1c4eb4f8-0169-448d-82e4-60a7319ac2ef	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	034c8ca326d5b84f0279a8e44eef40fbc993a208f261715091c7216a56c32cd0	13df7a05-ba86-4116-9681-18bc34b6288c	51ff4600-7ac6-4118-b195-5de5707eceaf	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:15:22.169+00	2026-04-22 14:18:43.826+00	2026-04-22 14:15:22.170046+00
51ff4600-7ac6-4118-b195-5de5707eceaf	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	e9706029c6c67158b3991e9a7c70206a183e0685214ed5e86a995d8a7f9cad8a	13df7a05-ba86-4116-9681-18bc34b6288c	f9cbb001-1498-4930-8d9d-415ba34270a1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:18:43.818+00	2026-04-22 14:22:23.792+00	2026-04-22 14:18:43.818883+00
f9cbb001-1498-4930-8d9d-415ba34270a1	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	ff3e3e9959ef114f4f9caa4b38554a088fcf0ee1f0858e539ccfd19f666aca47	13df7a05-ba86-4116-9681-18bc34b6288c	7b8a541f-6701-4f21-bb3b-d8093f18b8fd	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:22:23.782+00	2026-04-22 14:23:13.645+00	2026-04-22 14:22:23.784461+00
7b8a541f-6701-4f21-bb3b-d8093f18b8fd	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	2a0e67b7814a165ed374bc10a2efe6610443b174a15095424c0c5aaaa78a5b21	13df7a05-ba86-4116-9681-18bc34b6288c	45c64dca-d674-4daa-8e60-2563dbe90a9e	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:23:13.634+00	2026-04-22 14:24:04.148+00	2026-04-22 14:23:13.638837+00
45c64dca-d674-4daa-8e60-2563dbe90a9e	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	e11ce3b849940c304db652b16ba2029c2f5062687aa4a2c3aa1fea7f4e7f2bfb	13df7a05-ba86-4116-9681-18bc34b6288c	e501dc70-3f3f-48f4-912d-52ae73b0928f	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:24:04.14+00	2026-04-22 14:26:36.686+00	2026-04-22 14:24:04.141441+00
e501dc70-3f3f-48f4-912d-52ae73b0928f	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	81bed8589212264d3449cdc2f2805def855578af638c2c62d65e2e4d673736f8	13df7a05-ba86-4116-9681-18bc34b6288c	9fec55d4-3219-44e6-a21c-4a27a6e2048c	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:26:36.679+00	2026-04-22 14:29:40.836+00	2026-04-22 14:26:36.680358+00
5b20d9dc-55d0-45ca-9098-248115d11070	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	32eabb6b2a9e7dc9f60d8312a3299317896cdfd9fe3fb78463a47a788bf5e959	13df7a05-ba86-4116-9681-18bc34b6288c	4a9d2862-1d3a-432e-89cf-b442a6048179	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:30:09.189+00	2026-04-22 14:30:10.077+00	2026-04-22 14:30:09.193366+00
9fec55d4-3219-44e6-a21c-4a27a6e2048c	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	56c31ea42598b3fcd3ec916fbaced29a7357ef7b2e7f2a86289f3eced1bdb326	13df7a05-ba86-4116-9681-18bc34b6288c	5b20d9dc-55d0-45ca-9098-248115d11070	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:29:40.826+00	2026-04-22 14:30:09.199+00	2026-04-22 14:29:40.82799+00
4a9d2862-1d3a-432e-89cf-b442a6048179	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	f6f684a139d55f92dcc2cca479b99b29db5437dfcaa4a9ec11b2abcb1a253627	13df7a05-ba86-4116-9681-18bc34b6288c	1e068ae8-0be9-4935-a9c2-df6913477149	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:30:10.071+00	2026-04-22 14:30:10.376+00	2026-04-22 14:30:10.071939+00
1e068ae8-0be9-4935-a9c2-df6913477149	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	52f88743b3f81fec4e591b6e2ae1e3915368e64f3f2584b2347ae1f6cc9cd90d	13df7a05-ba86-4116-9681-18bc34b6288c	63d98b41-6e80-4c49-afd8-53954f60b23d	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:30:10.369+00	2026-04-22 14:30:10.531+00	2026-04-22 14:30:10.370357+00
63d98b41-6e80-4c49-afd8-53954f60b23d	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	fd0beebd3796049d29c8dcb28ea3e8821da55e52d6391a91e67e7187f23ff8ed	13df7a05-ba86-4116-9681-18bc34b6288c	41c37a0e-769c-405a-acfe-22060756af34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:30:10.523+00	2026-04-22 14:30:10.716+00	2026-04-22 14:30:10.52452+00
41c37a0e-769c-405a-acfe-22060756af34	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	e9462fee81bc2c079b45ff9e5a0032b46f9307f927167e26e747f69d40c22096	13df7a05-ba86-4116-9681-18bc34b6288c	f8ce794d-8f37-40f0-a377-75b76a382dbf	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:30:10.709+00	2026-04-22 14:30:11.048+00	2026-04-22 14:30:10.709919+00
f8ce794d-8f37-40f0-a377-75b76a382dbf	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	0767240dd9cd5f49c090a3f5c7f05b5608d68c7fcb1e7211b5bf62306640243d	13df7a05-ba86-4116-9681-18bc34b6288c	1d2ef79f-9b32-428c-9338-650b6a60b79c	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:30:11.038+00	2026-04-22 14:30:11.367+00	2026-04-22 14:30:11.041867+00
1d2ef79f-9b32-428c-9338-650b6a60b79c	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	193b7de222a79ef683e989ce8bbc194b44658f1ffe840ab3a58b0c3114fdb261	13df7a05-ba86-4116-9681-18bc34b6288c	f4fb7e62-de42-46c4-91aa-ea9ebcff2f5e	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 14:30:11.357+00	2026-04-22 15:05:58.769+00	2026-04-22 14:30:11.360267+00
aabc4884-6dd4-41da-b701-4f2a7229bca3	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	a1725fda308e3c1cefd9988e491dbb26b970cf85a330121ec5d248a9422f7195	13df7a05-ba86-4116-9681-18bc34b6288c	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 15:08:47.946+00	\N	2026-04-22 15:08:47.947709+00
f4fb7e62-de42-46c4-91aa-ea9ebcff2f5e	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	b6ddf0ebd5d2ee04ae6ef2f9aecd38e7d387e067bd1e4342ddc8772f6b5b2e57	13df7a05-ba86-4116-9681-18bc34b6288c	aabc4884-6dd4-41da-b701-4f2a7229bca3	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-04-29 15:05:58.76+00	2026-04-22 15:08:47.95+00	2026-04-22 15:05:58.76082+00
8047c84f-bf12-4830-93e4-870135ae951b	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	d9508eae3114bdb90e29aacc94b78aec49919df0d5c0b0a20f9c51ef8c794ef9	88a67e81-f792-4b93-872e-94c032c43e40	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-11 10:12:53.969+00	2026-05-04 10:15:38.587+00	2026-05-04 10:12:53.971707+00
323c0874-171c-449a-9820-3058063f4b7c	8cb0404c-713f-4324-bc60-fbb7b3d3716c	79545ca702ab8acb2fbfc2294cb82ace58d4881ecc3d7ebdb76e5307a77793dc	b8fce8a8-0a51-4a5c-9e79-44f5b7dae454	\N	curl/8.17.0	::ffff:172.18.0.1	2026-05-11 12:21:36.063+00	\N	2026-05-04 12:21:36.064827+00
f9628b4c-3f77-4a6b-bc48-7569a8cd5612	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	fce296d56406d0e45aa41be5511e0938a5cf9ddb7899e524139fd237fed7128a	becfa29e-02d6-4e92-ab38-2fe2addb9936	fc64a8fb-bddd-4061-849b-178399b7e3f5	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-11 12:20:02.989+00	2026-05-05 09:11:22.43+00	2026-05-04 12:20:02.992219+00
fc64a8fb-bddd-4061-849b-178399b7e3f5	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	ce8cda647e8bad55cf35ffc7bac3277b1c4a45c17f3264ff682ccc6023613fed	becfa29e-02d6-4e92-ab38-2fe2addb9936	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-12 09:11:22.411+00	2026-05-05 09:11:26.277+00	2026-05-05 09:11:22.413544+00
0a66e6be-0620-48ab-ac69-4f3999e3fbc7	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	6978ef46cf4bb16c5d11186f3b57f6618d77add147e9227890b2925694870a25	371d114a-a31d-4eb4-8c85-b87c7be81841	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-15 14:20:51.593+00	2026-05-08 14:20:56.952+00	2026-05-08 14:20:51.595294+00
7b40de6d-db7e-4283-a13b-8b314c07b825	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	d4d8efdf72dc7669e45d313988cb25a20348289ed1293f2afa49df6df8d978ba	aac9f1ac-1580-4b91-9fd7-54f1f2b0d1fb	b1ad4dd9-6a9e-4586-babb-336586df43c8	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-15 14:21:02.76+00	2026-05-08 14:26:53.992+00	2026-05-08 14:21:02.761776+00
b1ad4dd9-6a9e-4586-babb-336586df43c8	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	7e099f25845aa0cda244080523c36e31ea1bd7251895450f4591cda9d798929b	aac9f1ac-1580-4b91-9fd7-54f1f2b0d1fb	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-15 14:26:53.984+00	2026-05-08 14:30:18.873+00	2026-05-08 14:26:53.986039+00
36389475-f642-4fec-8418-016ca513ea1f	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	b18bf5c9253073980f23b1f3f0525eb976ba9fdf1e03f43f2c149f1ecd01cf91	bae148b6-7e3e-4e08-b613-aeeea24c56c6	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-15 14:30:40.145+00	2026-05-08 14:33:29.947+00	2026-05-08 14:30:40.146686+00
d9dccb00-b393-4d78-9e9c-f57839c1d805	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	81361e3627471de1ad20fa8698c4fa636b0a1d046990e8cda7fcb9379a4875ca	8b6abb4e-5b1d-4e52-8ea0-b8f12a387b5d	5ff899e7-307d-47f7-94ff-5534a6e2842c	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-15 14:46:35.869+00	2026-05-11 08:25:13.348+00	2026-05-08 14:46:35.871826+00
5ff899e7-307d-47f7-94ff-5534a6e2842c	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	8c919e9e01a5b7c47af582c984f6d976242853d2bb4757506877b9dc640e1e6f	8b6abb4e-5b1d-4e52-8ea0-b8f12a387b5d	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-18 08:25:13.222+00	2026-05-11 08:25:19.986+00	2026-05-11 08:25:13.240271+00
f649c9c3-e2fd-40a0-88c9-dcbb515a3a08	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	7c044ed281fc47b7f1f4fa982b26155a9ae9aa86025298a616f1a08d0028bd74	2c3ec43e-9662-4553-b21b-a0c40fc66d96	80fbbe1e-5638-40f4-beee-6a2a9708cb1c	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-18 08:25:24.202+00	2026-05-11 08:35:30.22+00	2026-05-11 08:25:24.204016+00
80fbbe1e-5638-40f4-beee-6a2a9708cb1c	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	9a941f5b70f59030033d2d8a5ac74751d955a3378eaf7f6f1376202c5e61612f	2c3ec43e-9662-4553-b21b-a0c40fc66d96	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-18 08:35:30.211+00	2026-05-11 08:35:34.41+00	2026-05-11 08:35:30.213931+00
f431e8c5-5897-44a5-a643-619a9524e630	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	b1d72a463b267cf8f2cbc0153886345f644826c9c6c13551ce38f1d63ed98dfa	d9378d21-5122-4cf2-bdb7-0288c3e1059f	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-18 08:35:42.389+00	2026-05-11 08:36:12.401+00	2026-05-11 08:35:42.391073+00
d96bc54d-e6cb-4d35-b7bd-00e42b9bc89d	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	871195f0153d09243a367df4b1916f3940818704d8cde705df11345d1ebd92d5	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	ece10c1a-b488-40fa-a368-c3f69b9fe5d5	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 11:12:24.742+00	2026-05-13 11:13:31.053+00	2026-05-13 11:12:24.746443+00
ece10c1a-b488-40fa-a368-c3f69b9fe5d5	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	068a2bab73ae8a2ec4abd47b4578b5387c70bfd8f06e876edc6991f54c25e3ea	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	b5f80ac6-b66b-4160-bed5-3ae0766e3a3f	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 11:13:31.047+00	2026-05-13 11:41:12.273+00	2026-05-13 11:13:31.049707+00
86145a76-c563-4e7e-bf25-e945341be704	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	59188b6a05e689b34ef155f9b8a65611ce5db13744e506d3133582ced205f32a	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	8600d76c-a20f-4e5b-ae5f-486bac08a71d	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 11:41:35.217+00	2026-05-13 11:51:39.324+00	2026-05-13 11:41:35.219921+00
b5f80ac6-b66b-4160-bed5-3ae0766e3a3f	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	85fec78af8fe8448f94a26240c05638d7b3c8b62f25326125f505bdbcd6df7da	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	86145a76-c563-4e7e-bf25-e945341be704	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 11:41:12.252+00	2026-05-13 11:41:35.229+00	2026-05-13 11:41:12.263219+00
8600d76c-a20f-4e5b-ae5f-486bac08a71d	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	736acb3e19858004f9e8341ede303187f289ee552276e982e516caa3705b3fae	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	9b870c90-f8bb-4983-b66e-6d224a60b956	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 11:51:39.3+00	2026-05-13 11:51:47.812+00	2026-05-13 11:51:39.30597+00
9b870c90-f8bb-4983-b66e-6d224a60b956	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	f569edc0d82cd560711ea08d8916911b8c925e853a510b9114676094b6ec7a8c	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	6262b3d0-f63b-47ab-891d-7c610943c25c	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 11:51:47.801+00	2026-05-13 11:51:54.997+00	2026-05-13 11:51:47.804433+00
0c710149-96b0-4f65-a4b7-4e6d704e1fd5	65093de4-c6f8-40bc-9ad4-d2cbd6583cda	e7530dbe139ec8539585f893aae7fefb078ee07e7a4396ad0ea643127640b612	99c0b622-4db3-4481-9de2-78873d45cca5	d8ee0849-61c0-4f27-99e1-55964a9ec142	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:03:26.069+00	2026-05-13 12:03:37.707+00	2026-05-13 12:03:26.085807+00
6262b3d0-f63b-47ab-891d-7c610943c25c	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	5b61ef316879d29d840a205a4075293dcd77b47e2a26f43e58ad618f675c3f96	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	b9c90a57-3ef1-4332-8d7c-47984858a0fa	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 11:51:54.989+00	2026-05-13 12:07:35.938+00	2026-05-13 11:51:54.992554+00
d8ee0849-61c0-4f27-99e1-55964a9ec142	65093de4-c6f8-40bc-9ad4-d2cbd6583cda	e212d26b37ec18bcb4abafd0878aaaf4ab3de94f86e8d15359ecb076dd498563	99c0b622-4db3-4481-9de2-78873d45cca5	cf8c34d2-5f11-4bae-94f8-ccfa1bda5a07	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:03:37.694+00	2026-05-13 12:09:11.919+00	2026-05-13 12:03:37.701058+00
cf8c34d2-5f11-4bae-94f8-ccfa1bda5a07	65093de4-c6f8-40bc-9ad4-d2cbd6583cda	4f2e3e86da9a1d0b48fa6ef33d96bc4b7e25947e0b149196485af6a9bbeb8adb	99c0b622-4db3-4481-9de2-78873d45cca5	c7ac1f71-927b-481e-9b1a-f13f5cd73835	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:09:11.91+00	2026-05-13 12:09:53.859+00	2026-05-13 12:09:11.912738+00
c7ac1f71-927b-481e-9b1a-f13f5cd73835	65093de4-c6f8-40bc-9ad4-d2cbd6583cda	13fa31a6a51aa645f9f2cdf1b0842ecb23603d36d23c001ad1a0efbae178d95a	99c0b622-4db3-4481-9de2-78873d45cca5	2e5f7684-5ad7-4be1-b7b9-498cc67fe9d0	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:09:53.846+00	2026-05-13 12:12:00.725+00	2026-05-13 12:09:53.848113+00
2e5f7684-5ad7-4be1-b7b9-498cc67fe9d0	65093de4-c6f8-40bc-9ad4-d2cbd6583cda	18fa117004354b173a40280c3e2635bf01446d8714c53566ec69639212c6f53d	99c0b622-4db3-4481-9de2-78873d45cca5	cd2e456e-7c58-4ba8-82aa-037f13518365	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:12:00.716+00	2026-05-13 12:12:26.191+00	2026-05-13 12:12:00.717571+00
b9c90a57-3ef1-4332-8d7c-47984858a0fa	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	1830f59acdb90f291d6bbe13e5a95cc069e0b53d350df5ff6455a8bc451c673c	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	304e7807-5255-4cc3-8f94-d99b51ef287b	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:07:35.931+00	2026-05-13 12:14:29.73+00	2026-05-13 12:07:35.932397+00
cd2e456e-7c58-4ba8-82aa-037f13518365	65093de4-c6f8-40bc-9ad4-d2cbd6583cda	8b54a9cef45ecce0f51d32d4fdea53f25cf19a64983af0f5e02ea0129b78750c	99c0b622-4db3-4481-9de2-78873d45cca5	83d72bdd-3260-48b8-9f3f-340e27443ff8	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:12:26.184+00	2026-05-13 12:23:54.967+00	2026-05-13 12:12:26.186213+00
304e7807-5255-4cc3-8f94-d99b51ef287b	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	28135be7de519c5f673fb1acc2ef91cc1366884a73eb4fb9bd46447a0d8f8c62	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	5d062376-97bc-4977-a872-f7b25912ea37	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:14:29.706+00	2026-05-13 12:23:55.031+00	2026-05-13 12:14:29.71096+00
5d062376-97bc-4977-a872-f7b25912ea37	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	d955be17b75f118e8cc841294c264a865880ad5d80bfc3abf7c5ddaaef18dead	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	23d04c39-1fbc-4e9a-bd4c-f62d3e648c2d	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:23:55.004+00	2026-05-13 12:32:59.232+00	2026-05-13 12:23:55.014904+00
83d72bdd-3260-48b8-9f3f-340e27443ff8	65093de4-c6f8-40bc-9ad4-d2cbd6583cda	0bbcec5c99b19133a7bd4252325a9e8768b50466e2e7d5c305513fe0a12868b7	99c0b622-4db3-4481-9de2-78873d45cca5	4738e535-8a79-4682-ac13-1460817c6d69	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:23:54.953+00	2026-05-13 12:32:59.259+00	2026-05-13 12:23:54.956175+00
23d04c39-1fbc-4e9a-bd4c-f62d3e648c2d	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	3ad4cf6e649e9ec02f12f2bc0c33e635465eb368f8ae435d8034162afaffcd9d	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	7711933c-d6eb-4248-a524-33483d44b8a2	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:32:59.22+00	2026-05-13 12:38:49.117+00	2026-05-13 12:32:59.222356+00
7711933c-d6eb-4248-a524-33483d44b8a2	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	7ee0f77e3ee9e329e2cf46f59e18fad50bbc0511230be801587d535f8526b0e3	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	8f39615d-11a4-4cfe-9ead-3e599dac51ba	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:38:49.102+00	2026-05-13 12:40:54.36+00	2026-05-13 12:38:49.104498+00
8f39615d-11a4-4cfe-9ead-3e599dac51ba	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	0e5a03ea328879746950bfebbdea4ba297a44701c37398839c23514048ac6354	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	4df80456-4ae1-4081-9edf-d73918b6735f	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:40:54.351+00	2026-05-13 12:46:20.389+00	2026-05-13 12:40:54.352473+00
4df80456-4ae1-4081-9edf-d73918b6735f	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	1bc16afe40b18e9bcd54cf16aec0f0f04caafe42f7dbc62f8315647be326b98f	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	3a2ec81d-4e6b-421a-b137-96cb324c60e1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:46:20.382+00	2026-05-13 12:51:05.642+00	2026-05-13 12:46:20.383388+00
3a2ec81d-4e6b-421a-b137-96cb324c60e1	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	ae8ccee3c133b7a444d9f5fa17da41be5e064c20113900289b43dd4099105e06	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	bf99413a-690a-4cc7-8a83-c3fa6162d87a	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:51:05.622+00	2026-05-13 13:00:12.94+00	2026-05-13 12:51:05.62608+00
bf99413a-690a-4cc7-8a83-c3fa6162d87a	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	e630788e01907fca6a698d400dec60afc7be1cc25b2567590ecbe3d6fa8fa370	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	9750effa-882e-401c-91f8-4e635ad37938	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 13:00:12.928+00	2026-05-13 13:00:22.128+00	2026-05-13 13:00:12.930457+00
4738e535-8a79-4682-ac13-1460817c6d69	65093de4-c6f8-40bc-9ad4-d2cbd6583cda	13358be0b3c8b90a7ebb4f1d72928166ddb0fdd0734ed87394ef089aa46a69bc	99c0b622-4db3-4481-9de2-78873d45cca5	7b5b741f-bf8b-41ad-9f0a-2b6c4cc95382	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 12:32:59.235+00	2026-05-13 13:16:11.833+00	2026-05-13 12:32:59.238328+00
ee0fd8d0-526a-4006-923a-01376f27f6d9	65093de4-c6f8-40bc-9ad4-d2cbd6583cda	a4574705a01e492e02d3aa8d7a710353e5141052123967524603a11530957a5c	99c0b622-4db3-4481-9de2-78873d45cca5	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 13:16:46.613+00	\N	2026-05-13 13:16:46.616284+00
7b5b741f-bf8b-41ad-9f0a-2b6c4cc95382	65093de4-c6f8-40bc-9ad4-d2cbd6583cda	e1f567d361d47cd094030f280099837e472bb4bffe60fd3857c70362881419a9	99c0b622-4db3-4481-9de2-78873d45cca5	ee0fd8d0-526a-4006-923a-01376f27f6d9	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 13:16:11.705+00	2026-05-13 13:16:46.649+00	2026-05-13 13:16:11.793833+00
6e461576-327d-447a-845f-5a474cdcdd72	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	add715ed2e302d093eb6d3a578f5287305367720ba6f564637777c1e1bd3d7e8	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	2e02f9da-1583-48d9-adfb-f3261f281660	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 13:22:50.083+00	2026-05-13 13:22:55.163+00	2026-05-13 13:22:50.087921+00
9750effa-882e-401c-91f8-4e635ad37938	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	b8a86633ea765877ca6da7ff8804cc4d36e8e2b191ecfcfd2174aafc96e9b1e1	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	6e461576-327d-447a-845f-5a474cdcdd72	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 13:00:22.1+00	2026-05-13 13:22:50.106+00	2026-05-13 13:00:22.105028+00
2e02f9da-1583-48d9-adfb-f3261f281660	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	a1d9171c2bfc8dd369ab6d340d90e920fd867d3b08c83d2bf859d39e934cad97	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	90cb8d74-1851-4e0f-8038-b162579adbae	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 13:22:55.15+00	2026-05-13 13:23:32.05+00	2026-05-13 13:22:55.154052+00
90cb8d74-1851-4e0f-8038-b162579adbae	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	390d818615ed2ba909501af8e5a1559759da41fa5890eca3b4ea17bfd43e813f	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	6332e937-8f92-4891-8591-0c01c385dc38	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 13:23:32.036+00	2026-05-13 13:24:48.734+00	2026-05-13 13:23:32.04129+00
6332e937-8f92-4891-8591-0c01c385dc38	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	1c790ed120e237389b11459a2846b485f42dc2416294983e39fa0a800bf229ed	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	126b3ddc-ebca-4c0b-9b40-d3395320001b	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 13:24:48.714+00	2026-05-13 14:59:41.723+00	2026-05-13 13:24:48.716553+00
126b3ddc-ebca-4c0b-9b40-d3395320001b	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	bc8114390d98907c222d829a0de1dd3be9df393eebd59aceccce0eb78fde8879	a5e14fa8-cefb-4135-80d4-e19fc3049f6e	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-20 14:59:41.684+00	2026-05-13 15:03:57.403+00	2026-05-13 14:59:41.690309+00
0b8e0909-3ef9-4934-af8e-fa9c07aa0294	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	613b345cde5741b8ab38167a8db6ccec1788995406caf837abfd4efbc9c8c428	07554d04-d8e9-44db-b83f-2a16f59208d2	b9cdba36-6345-4208-bff3-02fd8b87f640	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 07:53:09.456+00	2026-05-14 08:06:37.999+00	2026-05-14 07:53:09.459254+00
b9cdba36-6345-4208-bff3-02fd8b87f640	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	a1242aa972ca809063159ce3826961e4dbe96203b47fe2cdcd17db3de52f88e3	07554d04-d8e9-44db-b83f-2a16f59208d2	c1f209e5-3582-4712-b8bb-03bb78072c6d	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 08:06:37.985+00	2026-05-14 09:23:23.509+00	2026-05-14 08:06:37.987217+00
c1f209e5-3582-4712-b8bb-03bb78072c6d	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	28d81a7afd4545fa7429114c5246ce3f7050c4fdca850d3e335e75043fe6add8	07554d04-d8e9-44db-b83f-2a16f59208d2	2152ad12-fa24-4df5-a831-0c08fc0bed49	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 09:23:23.485+00	2026-05-14 09:32:43.466+00	2026-05-14 09:23:23.488541+00
2152ad12-fa24-4df5-a831-0c08fc0bed49	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	d4e26399b2436455bb1bdae9eb78d2c054edda592092d241f964bc061369d02d	07554d04-d8e9-44db-b83f-2a16f59208d2	aa09271a-3396-4a46-875b-6e080da8644a	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 09:32:43.458+00	2026-05-14 09:35:45.76+00	2026-05-14 09:32:43.460826+00
aa09271a-3396-4a46-875b-6e080da8644a	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	a9d9402299654daa687b1cf45ddaefa94faa5d07434807de3017674c4ddb3f10	07554d04-d8e9-44db-b83f-2a16f59208d2	469656be-482f-41a3-a6bc-c1496d76b9bf	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 09:35:45.737+00	2026-05-14 09:50:20.05+00	2026-05-14 09:35:45.745224+00
469656be-482f-41a3-a6bc-c1496d76b9bf	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	df6ef968662590a57fbfc58355c2900e6c55afe0c782b7392bdfa1449edce4a1	07554d04-d8e9-44db-b83f-2a16f59208d2	24362b60-310e-4c5c-addf-17bd1a6535b2	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 09:50:20.014+00	2026-05-14 10:05:49.222+00	2026-05-14 09:50:20.024324+00
24362b60-310e-4c5c-addf-17bd1a6535b2	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	263cacd87b4a232d9e4a1bdbf03028f014602f06f7235087b5de4a2dfa8f19b7	07554d04-d8e9-44db-b83f-2a16f59208d2	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 10:05:49.207+00	2026-05-14 10:05:51.064+00	2026-05-14 10:05:49.208329+00
5b23e296-dd9e-422d-b0aa-f66c0eb10b84	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	9d1a84cee8876f84b2781bbacf9e75a6329fe8a2ab1f38d8508080572ea623b6	129bb164-ae32-4b83-87f6-aa2911207509	5720e53b-2636-4121-af67-88abfa550f25	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 10:05:59.999+00	2026-05-14 10:21:00.002+00	2026-05-14 10:06:00.001048+00
5720e53b-2636-4121-af67-88abfa550f25	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	16cc9184971fcb6eff46014fc963738f59de3b6d1c113bba9eaf421e9391a281	129bb164-ae32-4b83-87f6-aa2911207509	a2dd8987-78d9-4748-b03b-5747b88049ae	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 10:20:59.992+00	2026-05-14 10:26:55.77+00	2026-05-14 10:20:59.993374+00
a2dd8987-78d9-4748-b03b-5747b88049ae	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	0180aa37099b4219551867d259b659af3adafdac5e488fd782e7cb0148ccdd0a	129bb164-ae32-4b83-87f6-aa2911207509	e1fa05c1-615d-4658-aefc-e740cd515d70	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 10:26:55.754+00	2026-05-14 10:50:20.017+00	2026-05-14 10:26:55.757582+00
e1fa05c1-615d-4658-aefc-e740cd515d70	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	b718f02e7aa9d30c1a8d2b135c20d7f893001764fbf26547d0022dd02a3d5b94	129bb164-ae32-4b83-87f6-aa2911207509	3249be27-4c6f-432b-bfe6-41c5e2307972	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 10:50:20.001+00	2026-05-14 11:02:07.558+00	2026-05-14 10:50:20.00293+00
3249be27-4c6f-432b-bfe6-41c5e2307972	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	1d63bf6c8189a32071547c9f2cdf0c09b3c4fa4c80ec03cab9c642d2c1f56436	129bb164-ae32-4b83-87f6-aa2911207509	c2a134c1-e4e0-470e-b405-811017f116e3	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 11:02:07.542+00	2026-05-14 12:12:06.203+00	2026-05-14 11:02:07.544258+00
c2a134c1-e4e0-470e-b405-811017f116e3	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	e74e82fb55ef9056509e3d353f8bb1ee336c6fcee6ddea0134340ed70de427ca	129bb164-ae32-4b83-87f6-aa2911207509	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 12:12:06.193+00	2026-05-14 12:13:58.86+00	2026-05-14 12:12:06.195086+00
39430f08-7df7-4058-9c74-15fa8bba660c	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	02e88784d1ed3760137eca1afe76bdd3efff1b490c8bbfe248f69b56d908281a	83ed9d0d-d3c9-4a8d-9a8b-0cbfade69d11	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 12:14:01.518+00	2026-05-14 12:14:06.484+00	2026-05-14 12:14:01.520551+00
2636dd08-4b08-4fa9-adf2-248d0a7a4b81	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	c6039e7b3b7c23e4e168c0dd3b6e106391a7c8d4f4ae55df424a3b85413cc4bd	6d62b45c-e652-4a03-8d7d-1c3e39d5375a	6b8574c0-8dbb-4117-b729-d2d78d528a91	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 12:14:08.494+00	2026-05-14 15:22:09.055+00	2026-05-14 12:14:08.495145+00
6b8574c0-8dbb-4117-b729-d2d78d528a91	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	4f637f37951a890ebedbc18e0c591c57b9ceb5a2a498f26d6e28926ba1998bea	6d62b45c-e652-4a03-8d7d-1c3e39d5375a	e839d9d4-3bfd-479b-9bd6-16af0992b0cb	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-21 15:22:09.008+00	2026-05-15 08:29:39.342+00	2026-05-14 15:22:09.017431+00
e839d9d4-3bfd-479b-9bd6-16af0992b0cb	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	2c5fa330b094a434a0eea9d44403e3902d2139fa5010168a3a6cee7503240e7a	6d62b45c-e652-4a03-8d7d-1c3e39d5375a	9b55e293-2ed5-44a2-82f3-be56722e8e89	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-22 08:29:39.334+00	2026-05-15 09:54:28.669+00	2026-05-15 08:29:39.335876+00
9b55e293-2ed5-44a2-82f3-be56722e8e89	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	3f4b0c2801c993a6571ace33f5e3c4c8bebc842e2ae4b73c94da7fb494224c45	6d62b45c-e652-4a03-8d7d-1c3e39d5375a	a01805f6-3732-4f0f-a9c7-27d6942218c6	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-22 09:54:28.635+00	2026-05-15 10:37:10.423+00	2026-05-15 09:54:28.641492+00
5f4a5686-fc56-4a90-aad9-871b3dbfe454	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	b045bd18d39b0f724bc92d07f1118579d725010c34a1d253052395532d8f7947	6d62b45c-e652-4a03-8d7d-1c3e39d5375a	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-22 10:40:08.055+00	2026-05-15 10:41:33.75+00	2026-05-15 10:40:08.057301+00
a01805f6-3732-4f0f-a9c7-27d6942218c6	5db60b77-4c9c-4387-8f72-8fc1c52a83f3	f58aaa007f1cf5d723a54bb7c793efab6a1c66801d33bb88843da48a37d684c2	6d62b45c-e652-4a03-8d7d-1c3e39d5375a	5f4a5686-fc56-4a90-aad9-871b3dbfe454	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-22 10:37:10.394+00	2026-05-15 10:40:08.08+00	2026-05-15 10:37:10.399714+00
d70dfc1c-1734-4ad5-8290-61d06b749b86	9c4bc36a-2d54-420f-8236-cb493c0a81dc	885c122b7791d28a828b1fb5f07293636e75690a705cf65536342cd360758cb3	ba2b8adb-b169-4abc-921a-96a9e7ff2951	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-22 10:43:14.3+00	2026-05-15 10:44:01.852+00	2026-05-15 10:43:14.30163+00
3ec1bab3-7c63-4b71-a1dd-e649f86b5be2	9c4bc36a-2d54-420f-8236-cb493c0a81dc	adcd6629acf242b356e066f484673350e862df66c8d02afae300df15d2fb9037	9b572a09-cc65-42d3-a4dc-5e4fbfcad2e6	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-22 11:01:00.251+00	2026-05-15 11:01:02.518+00	2026-05-15 11:01:00.254462+00
4961aaeb-506d-47e7-abbf-9ac826188a2f	9c4bc36a-2d54-420f-8236-cb493c0a81dc	ca607323dd62e957f3de837f863db6465ae86b17bbe9308acfc0e8f0950a6ceb	aa56c073-26c9-4da1-8b8c-159613708f76	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-22 11:09:24.721+00	2026-05-15 11:09:26.866+00	2026-05-15 11:09:24.722127+00
8928c4a5-0761-4cb8-918c-9a89266eeb8b	9c4bc36a-2d54-420f-8236-cb493c0a81dc	477c2db84ba12ca3d5e85f3d63bfbe45721d41f1a3326ff5f33a17e51c50255c	0e9878cb-d8cb-4f01-b321-2eb235cd596a	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-22 11:23:11.664+00	2026-05-15 11:23:15.666+00	2026-05-15 11:23:11.665995+00
417fdb99-2fc8-4824-8bc0-1087d17f57cc	20dd9754-1ad3-48e7-836f-6eb0c503ed2e	498204276589aabb2e3f3de2aaa95e067cde9aa1cb7e8ddc686ff8ad67f5b6ed	4f6a24d7-46d2-44c5-a74c-ff37d563eb4f	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-22 11:23:58.789+00	2026-05-15 11:24:05.445+00	2026-05-15 11:23:58.790069+00
0a73973a-4ac7-4831-b7e2-6921eaa88090	20dd9754-1ad3-48e7-836f-6eb0c503ed2e	17304163042e1c702501bd31001091b0e681eb4d1ac7b88b2645ef598a6a39d7	9ce1a2ee-78fe-42bf-8e9e-d784b85bf1cd	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-22 11:39:20.066+00	2026-05-15 11:39:22.528+00	2026-05-15 11:39:20.067691+00
3b052996-ea80-481e-9d0b-988405ccf347	20dd9754-1ad3-48e7-836f-6eb0c503ed2e	321fc5b98818a05140ed028bb74a2f8f44467f5ab4027394b0be709fb02740b1	b6efdd55-9602-4d82-8913-1a1400fcd42e	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	::ffff:172.18.0.1	2026-05-22 12:55:33.731+00	\N	2026-05-15 12:55:33.733162+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: evently_admin
--

COPY public.users (id, email, password_hash, full_name, role, organization_id, google_id, email_verified_at, is_active, last_login_at, created_at, updated_at, deleted_at) FROM stdin;
c9960695-698b-47f5-90a8-412ce0283b25	yt-admin-1776780049@test.com	$2b$12$uD1GHbSTg/MxR7sSGtL8VO2CLzpV2Sn2PS12XmaInlo3y5fbHmmsC	YT Admin	event_admin	173b75a1-7340-431f-898d-4407842ca54d	\N	\N	t	2026-04-21 14:00:51.75+00	2026-04-21 14:00:51.709328+00	2026-04-21 14:00:51.709328+00	\N
8acb1434-697f-4bb0-9fad-728069b65459	solo@user.org	$2b$12$mz7pSOqDJGrgAM2kEjZQVOKDEaFq/SV42o/7FDVHAVIyHYID5sMLW	Solo User	organizer	\N	\N	\N	t	2026-04-16 12:47:18.431+00	2026-04-16 12:47:18.413991+00	2026-04-16 12:47:18.413991+00	\N
00a60c59-8318-4b0a-82b8-a9eae0725263	admin@ngo.org	$2b$12$uD4Id3M/OyUVEK3LvTe9tOLpCb9V0TmLi/9.7seqhwZaaYtTS7K1a	NGO Admin	event_admin	7e7b113c-9317-4e88-a3cb-b4d3d01aaa88	\N	\N	t	2026-04-16 12:47:20.058+00	2026-04-16 12:46:43.300684+00	2026-04-16 12:46:43.300684+00	\N
b12d4fd3-5d67-4162-b5b2-1d70cf5b6a06	yt-1776780131@test.com	$2b$12$8gPhkw8T26b5Y0pqVmu86etRiy9sRW5Kk/5/uZ5XTSbw108cE874y	YT Admin	event_admin	80729e7c-33bb-4ea4-aebe-3f2a4a8e49f1	\N	\N	t	2026-04-21 14:02:12.536+00	2026-04-21 14:02:12.514169+00	2026-04-21 14:02:12.514169+00	\N
35853014-975c-4484-96af-2d36060ab46c	caveman@test.com	$2b$12$yyx3s0qUewGND56BB67AV.tm.wDb7gPpbMtK8K//gLfUxxmSDV1yS	Cave Man	event_admin	fddb472b-0bb3-4a8a-b8c8-94d947981ae2	\N	\N	t	2026-04-17 09:55:16.941+00	2026-04-17 09:51:55.216663+00	2026-04-17 09:51:55.216663+00	\N
1bddbac9-816f-48a2-9d7f-da1bb2ab7abc	yt-admin-1776780154@test.com	$2b$12$VNoLSHr116qMe.Dz7/K8suLG/fYwo5p5tV6ZC8TRH7vxK0zk/y2b.	YT Admin	event_admin	0448a2ca-fe5c-48b0-b7a2-d8107f40e4c7	\N	\N	t	2026-04-21 14:02:35.771+00	2026-04-21 14:02:35.757581+00	2026-04-21 14:02:35.757581+00	\N
55dd435c-c23c-4057-b95d-71d140b3833f	forma-1776841066@test.com	$2b$12$f/qnsloNMtROeTZDgnkAFOfmLVeXfXkMg1Jye4JbZ2ueDROr9HODm	A	event_admin	026400d2-3503-49ad-92bb-5c139e975b86	\N	\N	t	2026-04-22 06:57:46.802+00	2026-04-22 06:57:46.762378+00	2026-04-22 06:57:46.762378+00	\N
ad4442fc-859e-4f49-9df6-d567a2aac76e	s1test-other+1776426273@example.com	$2b$12$aTQ/JjS0LnoNmoGM/fKOeO/UcdprBWCDhr0RUTqk3f4NpGJdXQJLa	Other Org	event_admin	33547869-8c58-49ae-8770-c939b035a765	\N	\N	t	2026-04-17 11:44:35.287+00	2026-04-17 11:44:35.265931+00	2026-04-17 11:44:35.265931+00	\N
fa105022-2d94-4e86-a70f-73c693c77c1c	formb-1776841066@test.com	$2b$12$rPpblcXhPKfkLMXK28Hhw.bw/62/zUKihufPBWrGph71iXPecbPbC	B	event_admin	f659de33-7c8b-415a-8ad1-619a06cb4ada	\N	\N	t	2026-04-22 06:57:47.534+00	2026-04-22 06:57:47.512822+00	2026-04-22 06:57:47.512822+00	\N
10341386-c4c5-4e08-8421-f65264d31f66	s1test+1776426201@example.com	$2b$12$GT6Stsnjl7XxcXcDbBCeHu.537o6l3rAXrxyZNhDC90lD615eYpvK	Sprint Tester	event_admin	c9a87df1-36b6-45b1-9719-d6c0149b0465	\N	\N	t	2026-04-17 11:45:17.055+00	2026-04-17 11:43:21.723229+00	2026-04-17 11:43:21.723229+00	\N
3079a8cf-4016-4bde-b406-2806ec9da7ec	ship+1776426492@example.com	$2b$12$4hhkSwyb6p2oV.fP93qJkOYm1sspfuZ1nkDqg2HHZLfkt4qlSwS5i	Ship Tester	event_admin	39439ece-1a9e-4090-9662-eb5edb725e93	\N	\N	t	2026-04-17 11:48:13.821+00	2026-04-17 11:48:13.768938+00	2026-04-17 11:48:13.768938+00	\N
7d80b259-8db9-4a9d-ad25-330671afbe00	main-smoke+1776760146@example.com	$2b$12$CNOb8nQj1HPHw3QuyWIVE.fLtTFJJqILwC5nzTbajt2D.bbURA1Ey	Main Tester	event_admin	b3044578-71ec-4be3-bbd5-ae9a03b91eda	\N	\N	t	2026-04-21 08:29:07.874+00	2026-04-21 08:29:07.785698+00	2026-04-21 08:29:07.785698+00	\N
37cca90e-1105-4add-9336-5064497ca7bc	forma-1776842102@test.com	$2b$12$Vv2yUnHGkZBq0HtTenbZTuUSoqi/Va5cewqoh3YKtWtDrwcn0VHMO	A	event_admin	ac0e8778-f130-438b-9e8d-cfc9ea2a63d2	\N	\N	t	2026-04-22 07:15:03.392+00	2026-04-22 07:15:03.370053+00	2026-04-22 07:15:03.370053+00	\N
60340164-96f8-4061-ab2b-3880392c8333	pm+1776765562@test.io	$2b$12$04v6dA.A0iv4qeqmYOB1oOwSJ1eOhsRwgFXV.oIETwktG11K.pkMy	Test Admin	event_admin	de0bcbec-788f-4d15-b0a2-1b820890b489	\N	\N	t	2026-04-21 09:59:31.164+00	2026-04-21 09:59:27.034608+00	2026-04-21 09:59:27.034608+00	\N
9cc8a327-e787-45c0-8e6a-99cc156d6d20	a+1776765663@test.io	$2b$12$hGYZ6EFVHZ9na3KLEtPCkeV4AUtt7QcG5QUW59gzLfn.zTFeFdLye	A Admin	event_admin	ca2ae2ed-629c-4776-838d-926d02a4a0bd	\N	\N	t	2026-04-21 10:01:06.665+00	2026-04-21 10:01:05.885381+00	2026-04-21 10:01:05.885381+00	\N
97c4cdfe-3e71-43c6-a8f5-0701d7054709	formb-1776842102@test.com	$2b$12$Gj/QS3dC5.JMMHzHHWLQDOAXRhGKWLSm3th8VfRkad.viu8JCOGD.	B	event_admin	5576afed-5f14-4883-90e2-29bdad009e44	\N	\N	t	2026-04-22 07:15:04.072+00	2026-04-22 07:15:04.052154+00	2026-04-22 07:15:04.052154+00	\N
42f6f938-b10e-40b9-845e-c6a8cd85bdd3	b+1776765663@test.io	$2b$12$IxPw3CpCMBGAakxOGh0.xen0cnVpUcYySOhqHyJkL65W2WwiuPlP6	B Admin	event_admin	58abeea3-1d6c-4849-b745-4c9532b902f4	\N	\N	t	2026-04-21 10:01:09.298+00	2026-04-21 10:01:08.459738+00	2026-04-21 10:01:08.459738+00	\N
d62c5165-f707-463d-b1fe-5d16e9b42d93	c+1776765663@test.io	$2b$12$2By8bHC9MrmfQpGNz8z2Zua2KT.pc.vLuozAivGtC4o57OhWXlt.q	Plain Organizer	organizer	\N	\N	\N	t	2026-04-21 10:01:16.488+00	2026-04-21 10:01:15.816562+00	2026-04-21 10:01:15.816562+00	\N
43a4306b-44e2-4ff1-9655-5e561ec8e42d	att-1776845610@test.com	$2b$12$BCs3LeJnlon8h0zA0KOkAuueqii/pAqTy353qBsRzbxp/P6j44Ruu	A	event_admin	013f0291-44c7-4cf9-b9ac-12476cb17cb7	\N	\N	t	2026-04-22 08:13:31.591+00	2026-04-22 08:13:31.560016+00	2026-04-22 08:13:31.560016+00	\N
fc29a092-b21f-4f3e-8282-b9d7dc1bd050	att2-1776845770@test.com	$2b$12$D2RECuvT07MPrQfx6iQavO2JGvcUXXHZ.T1Zpy87340F3rkKHSa8.	A	event_admin	78e2e21b-21f9-4335-acbb-7dc3f727d6c9	\N	\N	t	2026-04-22 08:16:11.337+00	2026-04-22 08:16:11.315058+00	2026-04-22 08:16:11.315058+00	\N
b3897f61-81d0-424d-bf0c-74451aedab60	att3-1776846227@test.com	$2b$12$y2rO5gOxqxs83hKNubZiie6k6.asqz9H97QnJnVS3RsjX.60J04e6	A	event_admin	8c56cf26-daae-4ea5-9888-c4e09a2520a5	\N	\N	t	2026-04-22 08:23:48.36+00	2026-04-22 08:23:48.322173+00	2026-04-22 08:23:48.322173+00	\N
326b6978-cad0-40c3-aec2-843b07cdf604	att4-1776846281@test.com	$2b$12$Y01xYNSp/uugs9JAC/RxHOge2fji9edIuWUreMcnAWDm1UGpVzmMW	A	event_admin	6960c594-66f5-49e1-ae37-95f833033a8b	\N	\N	t	2026-04-22 08:24:41.988+00	2026-04-22 08:24:41.968257+00	2026-04-22 08:24:41.968257+00	\N
d5bc7a16-948b-48e4-8ec6-3773b5bb6ebf	att5-1776846324@test.com	$2b$12$mjNPvScOjCn0CEC9WpKtnOmmj53MTeks32ZMPUW.kewGblxvwg7A.	A	event_admin	bea42115-eafd-48cb-a060-aa94829b9638	\N	\N	t	2026-04-22 08:25:24.763+00	2026-04-22 08:25:24.748681+00	2026-04-22 08:25:24.748681+00	\N
57cbd3a8-4b76-4ac9-8f27-ae2ddf3fcdb9	att6-1776846374@test.com	$2b$12$P6Y8ZLEcSsDvaV941hEcZuYydk3Gh9J9aZINxKhE7NgG8HqN3w8l.	A	event_admin	96c1800f-e33f-49f4-b423-bc2957bbfa38	\N	\N	t	2026-04-22 08:26:14.562+00	2026-04-22 08:26:14.538707+00	2026-04-22 08:26:14.538707+00	\N
21ee6fbf-1ab1-4aa1-90ca-7265775e77de	full-1776846415@test.com	$2b$12$0L2iWdq09W2on8MCsEKvj.jZC276PMGxrmaCfRLJ8jVs56GtM5kNu	A	event_admin	5fa21644-8e2c-4a1d-be21-fd446905dd86	\N	\N	t	2026-04-22 08:26:56.389+00	2026-04-22 08:26:56.372987+00	2026-04-22 08:26:56.372987+00	\N
7822732e-4ec5-4499-b3b5-f790dcf70d4b	list-1776846438@test.com	$2b$12$rd.cUS/N5swGN6shvHBhvOLyDSZszEe1wW.iCsRp0ssn9Rm2DU3uW	A	event_admin	03a3e9d4-ff6e-431a-b468-c21a806f8a5a	\N	\N	t	2026-04-22 08:27:19.338+00	2026-04-22 08:27:19.323012+00	2026-04-22 08:27:19.323012+00	\N
20dd9754-1ad3-48e7-836f-6eb0c503ed2e	pj@gmail.com	$2b$12$.2g18lHxxHC5dOkqbD37yeewt/qSKKdCcV88OK5evw0ZVAz4DHUTe	Prathmesh Jagtap	event_admin	580c3eb2-d21f-4351-98dd-1561b708f83c	\N	\N	t	2026-05-15 12:55:33.746+00	2026-05-15 11:23:58.775117+00	2026-05-15 11:23:58.775117+00	\N
8cb0404c-713f-4324-bc60-fbb7b3d3716c	smoketest+1777897289@evently.dev	$2b$12$M8iZoqge4Thp5nCBQ2vmruEKsiVXQtGrL01KzxH46gLI62Cbg3PLO	Smoke Test	event_admin	07c26e07-6c51-421f-960d-dfc15dd063a5	\N	\N	t	2026-05-04 12:21:36.068+00	2026-05-04 12:21:36.038728+00	2026-05-04 12:21:36.038728+00	\N
920ef4e5-f1d7-4936-a255-41c2b3c65caf	live-1776852526@test.com	$2b$12$ucnmjhzk99EJfqOjNsGbiOBK84355JbRYk0cWtSCIijLwisUhP6oy	Live Tester	event_admin	31ffd921-762f-4f0c-8350-c1abf5766703	\N	\N	t	2026-04-22 10:08:47.007+00	2026-04-22 10:08:46.942406+00	2026-04-22 10:08:46.942406+00	\N
65093de4-c6f8-40bc-9ad4-d2cbd6583cda	test_verify@example.com	$2b$12$T2mTHgYEal22MsUwuBbRzunGEezdGIx0Xfj6Fx3V0m8R7Wc44QjNS	Test Verify	organizer	\N	\N	\N	t	2026-05-13 12:03:26.196+00	2026-05-13 12:03:25.696307+00	2026-05-13 12:03:25.696307+00	\N
9c4bc36a-2d54-420f-8236-cb493c0a81dc	nextventures.ecs@gmail.com	$2b$12$BJQ7l.aqnDSzkAYnWeKcMOEI.w6w65BCAlxMp.kfSrtA90klnYqGe	Adhyant Patil	event_admin	d29d2db3-6a4f-46f8-9c8e-561231db73e2	\N	\N	t	2026-05-15 11:23:12.13+00	2026-05-15 10:43:14.273951+00	2026-05-15 10:43:14.273951+00	\N
5db60b77-4c9c-4387-8f72-8fc1c52a83f3	upvedanaturals@gmail.com	$2b$12$w5S7iiSz1oJDQlkYnUHodexh0EVi7gNlQHbOcCPnIMkTChfflYF62	Prathm	event_admin	0eaca86d-f35f-40ca-a053-3a83f27acc9c	\N	\N	t	2026-05-14 12:14:08.501+00	2026-04-21 11:22:14.915155+00	2026-04-21 11:22:14.915155+00	\N
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: evently_admin
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 3, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: evently_admin
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: attendance_entries attendance_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.attendance_entries
    ADD CONSTRAINT attendance_entries_pkey PRIMARY KEY (id);


--
-- Name: event_rooms event_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.event_rooms
    ADD CONSTRAINT event_rooms_pkey PRIMARY KEY (id);


--
-- Name: event_rooms event_rooms_share_token_unique; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.event_rooms
    ADD CONSTRAINT event_rooms_share_token_unique UNIQUE (share_token);


--
-- Name: form_definitions form_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.form_definitions
    ADD CONSTRAINT form_definitions_pkey PRIMARY KEY (id);


--
-- Name: org_members org_members_pkey; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_unique; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_unique UNIQUE (slug);


--
-- Name: room_recordings room_recordings_pkey; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.room_recordings
    ADD CONSTRAINT room_recordings_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_hash_unique; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_google_id_unique; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_unique UNIQUE (google_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: attendance_entries_form_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX attendance_entries_form_idx ON public.attendance_entries USING btree (form_definition_id);


--
-- Name: attendance_entries_room_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX attendance_entries_room_idx ON public.attendance_entries USING btree (room_id);


--
-- Name: attendance_entries_submitted_at_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX attendance_entries_submitted_at_idx ON public.attendance_entries USING btree (submitted_at);


--
-- Name: event_rooms_org_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX event_rooms_org_idx ON public.event_rooms USING btree (organization_id);


--
-- Name: event_rooms_scheduled_start_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX event_rooms_scheduled_start_idx ON public.event_rooms USING btree (scheduled_start);


--
-- Name: event_rooms_status_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX event_rooms_status_idx ON public.event_rooms USING btree (status);


--
-- Name: form_definitions_room_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX form_definitions_room_idx ON public.form_definitions USING btree (room_id);


--
-- Name: form_definitions_room_version_unique; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE UNIQUE INDEX form_definitions_room_version_unique ON public.form_definitions USING btree (room_id, version);


--
-- Name: org_members_org_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX org_members_org_idx ON public.org_members USING btree (organization_id);


--
-- Name: org_members_user_org_uniq; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE UNIQUE INDEX org_members_user_org_uniq ON public.org_members USING btree (user_id, organization_id);


--
-- Name: room_recordings_egress_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX room_recordings_egress_idx ON public.room_recordings USING btree (egress_id);


--
-- Name: room_recordings_room_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX room_recordings_room_idx ON public.room_recordings USING btree (room_id);


--
-- Name: room_recordings_status_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX room_recordings_status_idx ON public.room_recordings USING btree (status);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_family_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX sessions_family_idx ON public.sessions USING btree (family_id);


--
-- Name: sessions_user_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX sessions_user_idx ON public.sessions USING btree (user_id);


--
-- Name: users_org_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX users_org_idx ON public.users USING btree (organization_id);


--
-- Name: users_role_idx; Type: INDEX; Schema: public; Owner: evently_admin
--

CREATE INDEX users_role_idx ON public.users USING btree (role);


--
-- Name: attendance_entries attendance_entries_form_definition_id_form_definitions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.attendance_entries
    ADD CONSTRAINT attendance_entries_form_definition_id_form_definitions_id_fk FOREIGN KEY (form_definition_id) REFERENCES public.form_definitions(id) ON DELETE RESTRICT;


--
-- Name: attendance_entries attendance_entries_room_id_event_rooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.attendance_entries
    ADD CONSTRAINT attendance_entries_room_id_event_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.event_rooms(id) ON DELETE CASCADE;


--
-- Name: attendance_entries attendance_entries_submitted_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.attendance_entries
    ADD CONSTRAINT attendance_entries_submitted_by_users_id_fk FOREIGN KEY (submitted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: event_rooms event_rooms_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.event_rooms
    ADD CONSTRAINT event_rooms_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: event_rooms event_rooms_organization_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.event_rooms
    ADD CONSTRAINT event_rooms_organization_id_organizations_id_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: form_definitions form_definitions_room_id_event_rooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.form_definitions
    ADD CONSTRAINT form_definitions_room_id_event_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.event_rooms(id) ON DELETE CASCADE;


--
-- Name: org_members org_members_invited_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_invited_by_users_id_fk FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_members org_members_organization_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_organization_id_organizations_id_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_members org_members_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: room_recordings room_recordings_room_id_event_rooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.room_recordings
    ADD CONSTRAINT room_recordings_room_id_event_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.event_rooms(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_replaced_by_id_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_replaced_by_id_sessions_id_fk FOREIGN KEY (replaced_by_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_organization_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: evently_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_organization_id_organizations_id_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict sEoWBef1e1fRXFZ0LLrLkHlWGImUfcx1ob6wBWbE3BMT3qBuPsuB14dXFd4wnXA

