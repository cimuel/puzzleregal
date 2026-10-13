"""Datenbanktests für Puzzleregal (Berechtigungen, Registrierung, Ausleihe-Schutz).

Ausführung (lokale PostgreSQL, Superuser-Verbindung):
    python3 supabase/tests/db_test.py
Jeder Test läuft in einer eigenen Transaktion, die am Ende zurückgerollt wird.
"""
import os, sys, pathlib, uuid
import psycopg
from psycopg import errors as E

ROOT = pathlib.Path(__file__).resolve().parent
DSN = os.environ.get("TEST_DSN", "dbname=puzzletest")

def run_file(conn, path):
    conn.execute(pathlib.Path(path).read_text())

def setup():
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("drop schema if exists public cascade; create schema public;")
        conn.execute("drop schema if exists auth cascade; drop schema if exists storage cascade; drop schema if exists extensions cascade;")
        conn.execute("drop role if exists anon; drop role if exists authenticated;")
        for f in ["00_stubs.sql", "../migrations/0001_schema.sql", "../migrations/0002_storage.sql", "../migrations/0003_phase3_kernfunktionen.sql", "../migrations/0004_phase4_ausleihe.sql"]:
            run_file(conn, ROOT / f)

class Ctx:
    """Eine Transaktion mit Hilfsfunktionen; wird am Ende zurückgerollt."""
    def __init__(self):
        self.conn = psycopg.connect(DSN)
    def close(self):
        self.conn.rollback(); self.conn.close()
    def sql(self, q, *a):  # als Superuser
        self.conn.execute("reset role")
        return self.conn.execute(q, a)
    def as_(self, uid, role="authenticated"):
        self.conn.execute("reset role")
        self.conn.execute("select set_config('request.jwt.claim.sub', %s, true)", (str(uid) if uid else "",))
        self.conn.execute(f"set local role {role}")
    def code(self, code="geheimcode1", **kw):
        cols = ", ".join(["code"] + list(kw)); vals = ", ".join(["%s"] * (1 + len(kw)))
        self.sql(f"insert into public.invite_codes ({cols}) values ({vals})", code, *kw.values())
    def user(self, name, status="approved", role="member"):
        self.code_once()
        uid = uuid.uuid4()
        self.sql("insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, %s::jsonb)",
                 uid, f"{name.lower()}@example.org",
                 '{"display_name": "%s", "invite_code": "reusecode1"}' % name)
        self.sql("update public.profiles set status=%s, role=%s where id=%s", status, role, uid)
        return uid
    def code_once(self):
        if not self.sql("select 1 from public.invite_codes where code='reusecode1'").fetchone():
            self.code("reusecode1")
    def puzzle(self, creator, title="Alpen", brand="Ravensburger", no="12345", pieces=1000):
        return self.sql("insert into public.puzzles (title, brand, product_no, piece_count, created_by) "
                        "values (%s,%s,%s,%s,%s) returning id", title, brand, no, pieces, creator).fetchone()[0]
    def attempt(self, uid, puzzle, seconds, team=1, kind="training", day="2026-01-01", parts=None):
        """Versuch direkt (als Superuser) anlegen, mit Teilnehmenden."""
        aid = self.sql("insert into public.attempts (puzzle_id, duration_seconds, created_by, team_size, kind, solved_on) "
                       "values (%s,%s,%s,%s,%s,%s) returning id", puzzle, seconds, uid, team, kind, day).fetchone()[0]
        for pid in (parts or [uid]):
            self.sql("insert into public.attempt_participants values (%s,%s)", aid, pid)
        return aid
    def copy(self, puzzle, owner):
        return self.sql("insert into public.copies (puzzle_id, owner_id) values (%s,%s) returning id",
                        puzzle, owner).fetchone()[0]

tests = []
def test(fn):
    tests.append(fn)
    return fn

def run_all():
    results = []
    for fn in tests:
        ctx = Ctx()
        try:
            fn(ctx); results.append((fn.__name__, True, ""))
        except AssertionError as e:
            results.append((fn.__name__, False, f"Assertion: {e}"))
        except Exception as e:
            results.append((fn.__name__, False, f"{type(e).__name__}: {e}"))
        finally:
            ctx.close()
    return results

def raises(ctx, exc, q, *a):
    ctx.conn.execute("savepoint s")
    try:
        ctx.conn.execute(q, a)
    except exc:
        ctx.conn.execute("rollback to savepoint s"); return
    except Exception as e:
        raise AssertionError(f"falsche Ausnahme {type(e).__name__}: {e}")
    raise AssertionError(f"keine Ausnahme {exc.__name__} bei: {q}")

# ---------------- Registrierung ----------------
def reg(ctx, meta):
    ctx.sql("insert into auth.users (email, raw_user_meta_data) values ('x@example.org', %s::jsonb)", meta)

@test
def registrierung_ohne_code_scheitert(c):
    raises(c, E.RaiseException, "insert into auth.users (email, raw_user_meta_data) values ('x@e.org', '{\"display_name\":\"Anna\"}')")

@test
def registrierung_mit_falschem_code_scheitert(c):
    c.code()
    raises(c, E.RaiseException, "insert into auth.users (email, raw_user_meta_data) values ('x@e.org', '{\"display_name\":\"Anna\",\"invite_code\":\"falsch12345\"}')")

@test
def registrierung_mit_code_ergibt_wartendes_profil(c):
    c.code("Geheimcode1".lower())
    c.sql("insert into auth.users (email, raw_user_meta_data) values ('a@e.org', '{\"display_name\":\" Anna \",\"invite_code\":\" GEHEIMCODE1 \"}')")
    row = c.sql("select display_name, status, role from public.profiles").fetchone()
    assert row == ("Anna", "pending", "member"), row

@test
def code_mit_max_uses_wird_begrenzt(c):
    c.code("einmalcode1", max_uses=1)
    c.sql("insert into auth.users (email, raw_user_meta_data) values ('a@e.org', '{\"display_name\":\"Anna\",\"invite_code\":\"einmalcode1\"}')")
    raises(c, E.RaiseException, "insert into auth.users (email, raw_user_meta_data) values ('b@e.org', '{\"display_name\":\"Berta\",\"invite_code\":\"einmalcode1\"}')")

@test
def inaktiver_code_wird_abgelehnt(c):
    c.code("altcode12345", active=False)
    raises(c, E.RaiseException, "insert into auth.users (email, raw_user_meta_data) values ('a@e.org', '{\"display_name\":\"Anna\",\"invite_code\":\"altcode12345\"}')")

@test
def zu_kurzer_name_wird_abgelehnt(c):
    c.code()
    raises(c, E.RaiseException, "insert into auth.users (email, raw_user_meta_data) values ('a@e.org', '{\"display_name\":\"A\",\"invite_code\":\"geheimcode1\"}')")

@test
def anon_darf_nur_ping_und_keine_tabellen(c):
    c.as_(None, "anon")
    assert c.conn.execute("select public.ping()").fetchone()[0] is not None
    for tbl in ["profiles", "puzzles", "invite_codes", "attempts"]:
        raises(c, E.InsufficientPrivilege, f"select * from public.{tbl}")
    raises(c, E.InsufficientPrivilege, "select public.is_admin()")

# ---------------- Sichtbarkeit ----------------
@test
def anon_hat_keinen_zugriff(c):
    c.as_(None, "anon")
    for t in ["profiles", "puzzles", "copies", "attempts", "events", "invite_codes", "copy_current_state"]:
        raises(c, E.InsufficientPrivilege, f"select * from public.{t}")

@test
def wartender_sieht_nur_sich_selbst_und_keine_puzzles(c):
    anna = c.user("Anna"); neu = c.user("Neu", status="pending")
    c.puzzle(anna)
    c.as_(neu)
    assert c.conn.execute("select count(*) from public.profiles").fetchone()[0] == 1
    assert c.conn.execute("select count(*) from public.puzzles").fetchone()[0] == 0

@test
def gesperrter_sieht_nichts(c):
    anna = c.user("Anna"); b = c.user("Blocked", status="blocked")
    c.puzzle(anna); c.as_(b)
    assert c.conn.execute("select count(*) from public.puzzles").fetchone()[0] == 0
    raises(c, E.Error, "insert into public.puzzles (title, piece_count, created_by) values ('x', 10, %s)", b)

@test
def freigegebene_sehen_alle_profile_und_puzzles(c):
    anna = c.user("Anna"); bea = c.user("Bea"); c.puzzle(anna)
    c.as_(bea)
    assert c.conn.execute("select count(*) from public.profiles").fetchone()[0] == 2
    assert c.conn.execute("select count(*) from public.puzzles").fetchone()[0] == 1

# ---------------- Rollen und Admin ----------------
@test
def mitglied_kann_rolle_und_status_nicht_selbst_aendern(c):
    anna = c.user("Anna"); c.as_(anna)
    raises(c, E.InsufficientPrivilege, "update public.profiles set role='admin' where id=%s", anna)
    raises(c, E.InsufficientPrivilege, "update public.profiles set status='approved' where id=%s", anna)

@test
def mitglied_kann_eigenen_namen_aendern_fremden_nicht(c):
    anna = c.user("Anna"); bea = c.user("Bea"); c.as_(anna)
    assert c.conn.execute("update public.profiles set display_name='Anna K.' where id=%s", (anna,)).rowcount == 1
    assert c.conn.execute("update public.profiles set display_name='Hack' where id=%s", (bea,)).rowcount == 0

@test
def mitglied_darf_keine_admin_funktionen(c):
    anna = c.user("Anna"); neu = c.user("Neu", status="pending"); c.as_(anna)
    raises(c, E.InsufficientPrivilege, "select public.admin_set_user_status(%s, 'approved')", neu)
    raises(c, E.InsufficientPrivilege, "select public.admin_set_user_role(%s, 'admin')", neu)

@test
def anon_darf_keine_funktionen_ausfuehren(c):
    neu = c.user("Neu", status="pending"); c.as_(None, "anon")
    raises(c, E.InsufficientPrivilege, "select public.admin_set_user_status(%s, 'approved')", neu)

@test
def admin_kann_freigeben_aber_nicht_sich_selbst_aendern(c):
    adm = c.user("Admin", role="admin"); neu = c.user("Neu", status="pending")
    c.as_(adm)
    c.conn.execute("select public.admin_set_user_status(%s, 'approved')", (neu,))
    c.as_(adm)
    assert c.conn.execute("select status from public.profiles where id=%s", (neu,)).fetchone()[0] == "approved"
    raises(c, E.RaiseException, "select public.admin_set_user_status(%s, 'blocked')", adm)
    raises(c, E.RaiseException, "select public.admin_set_user_role(%s, 'member')", adm)

@test
def wartender_admin_hat_keine_rechte(c):
    adm = c.user("Admin", role="admin", status="pending"); neu = c.user("Neu", status="pending")
    c.as_(adm)
    raises(c, E.InsufficientPrivilege, "select public.admin_set_user_status(%s, 'approved')", neu)

@test
def einladungscodes_nur_fuer_admins(c):
    anna = c.user("Anna"); adm = c.user("Admin", role="admin")
    c.as_(anna)
    assert c.conn.execute("select count(*) from public.invite_codes").fetchone()[0] == 0
    raises(c, E.Error, "insert into public.invite_codes (code) values ('hackcode12345')")
    c.as_(adm)
    assert c.conn.execute("select count(*) from public.invite_codes").fetchone()[0] >= 1
    c.conn.execute("insert into public.invite_codes (code, created_by) values ('neucode12345', %s)", (adm,))

# ---------------- Puzzles und Exemplare ----------------
@test
def puzzle_nur_ueber_funktion_erfassen_nicht_direkt(c):
    anna = c.user("Anna"); c.as_(anna)
    raises(c, E.InsufficientPrivilege, "insert into public.puzzles (title, piece_count, created_by) values ('x', 10, %s)", anna)

@test
def doppeltes_puzzle_gleiche_marke_und_nummer_wird_verhindert(c):
    anna = c.user("Anna"); c.puzzle(anna, brand="Ravensburger", no="12345")
    raises(c, E.UniqueViolation, "insert into public.puzzles (title, brand, product_no, piece_count, created_by) values ('Kopie', ' ravensburger ', '12345', 1000, %s)", anna)

@test
def gleiche_marke_ohne_produktnummer_ist_erlaubt(c):
    anna = c.user("Anna")
    c.puzzle(anna, no=None); c.puzzle(anna, title="Zweites", no=None)

@test
def fremdes_puzzle_nur_ersteller_oder_admin_aendern(c):
    anna = c.user("Anna"); bea = c.user("Bea"); adm = c.user("Admin", role="admin")
    p = c.puzzle(anna)
    c.as_(bea)
    assert c.conn.execute("update public.puzzles set title='Hack' where id=%s", (p,)).rowcount == 0
    c.as_(adm)
    assert c.conn.execute("update public.puzzles set title='Korrigiert' where id=%s", (p,)).rowcount == 1
    c.as_(anna)
    assert c.conn.execute("update public.puzzles set title='Eigener' where id=%s", (p,)).rowcount == 1
    assert c.conn.execute("delete from public.puzzles where id=%s", (p,)).rowcount == 0  # Löschen nur Admin

@test
def exemplar_nur_fuer_sich_selbst_erfassen_und_owner_nicht_aenderbar(c):
    anna = c.user("Anna"); bea = c.user("Bea"); p = c.puzzle(anna)
    c.as_(anna)
    raises(c, E.Error, "insert into public.copies (puzzle_id, owner_id) values (%s,%s)", p, bea)
    cid = c.conn.execute("insert into public.copies (puzzle_id, owner_id) values (%s,%s) returning id", (p, anna)).fetchone()[0]
    raises(c, E.InsufficientPrivilege, "update public.copies set owner_id=%s where id=%s", bea, cid)
    c.as_(bea)
    assert c.conn.execute("update public.copies set note='Hack' where id=%s", (cid,)).rowcount == 0
    assert c.conn.execute("delete from public.copies where id=%s", (cid,)).rowcount == 0

# ---------------- Ausleihen ----------------
@test
def exemplar_kann_nicht_doppelt_aktiv_verliehen_werden(c):
    anna = c.user("Anna"); bea = c.user("Bea"); cor = c.user("Cor"); p = c.puzzle(anna); cp = c.copy(p, anna)
    c.sql("insert into public.loans (copy_id, borrower_id, status) values (%s,%s,'lent')", cp, bea)
    raises(c, E.UniqueViolation, "insert into public.loans (copy_id, borrower_id, status) values (%s,%s,'accepted')", cp, cor)
    # abgeschlossene Ausleihen blockieren nicht
    c.sql("insert into public.loans (copy_id, borrower_id, status) values (%s,%s,'returned')", cp, cor)

@test
def doppelte_offene_anfrage_derselben_person_wird_verhindert(c):
    anna = c.user("Anna"); bea = c.user("Bea"); p = c.puzzle(anna); cp = c.copy(p, anna)
    c.sql("insert into public.loans (copy_id, borrower_id) values (%s,%s)", cp, bea)
    raises(c, E.UniqueViolation, "insert into public.loans (copy_id, borrower_id) values (%s,%s)", cp, bea)

@test
def ausleihen_nur_fuer_beteiligte_sichtbar_und_nicht_direkt_schreibbar(c):
    anna = c.user("Anna"); bea = c.user("Bea"); cor = c.user("Cor"); p = c.puzzle(anna); cp = c.copy(p, anna)
    c.sql("insert into public.loans (copy_id, borrower_id) values (%s,%s)", cp, bea)
    for uid, expected in [(anna, 1), (bea, 1), (cor, 0)]:
        c.as_(uid)
        assert c.conn.execute("select count(*) from public.loans").fetchone()[0] == expected, uid
    c.as_(bea)
    raises(c, E.InsufficientPrivilege, "insert into public.loans (copy_id, borrower_id, status) values (%s,%s,'lent')", cp, bea)
    raises(c, E.InsufficientPrivilege, "update public.loans set status='lent'")

@test
def standort_wird_aus_ausleihe_abgeleitet(c):
    anna = c.user("Anna"); bea = c.user("Bea"); cor = c.user("Cor"); p = c.puzzle(anna); cp = c.copy(p, anna)
    c.as_(cor)
    assert c.conn.execute("select holder_id, is_on_loan from public.copy_current_state where copy_id=%s", (cp,)).fetchone() == (anna, False)
    c.sql("insert into public.loans (copy_id, borrower_id, status) values (%s,%s,'lent')", cp, bea)
    c.as_(cor)
    row = c.conn.execute("select owner_id, holder_id, is_on_loan from public.copy_current_state where copy_id=%s", (cp,)).fetchone()
    assert row == (anna, bea, True), row

@test
def standortansicht_nicht_fuer_wartende(c):
    anna = c.user("Anna"); neu = c.user("Neu", status="pending"); p = c.puzzle(anna); c.copy(p, anna)
    c.as_(neu)
    assert c.conn.execute("select count(*) from public.copy_current_state").fetchone()[0] == 0

# ---------------- Versuche ----------------
@test
def versuche_nur_vom_ersteller_aenderbar(c):
    anna = c.user("Anna"); bea = c.user("Bea"); p = c.puzzle(anna)
    aid = c.attempt(anna, p, 3000)
    c.as_(bea)
    assert c.conn.execute("select count(*) from public.attempts").fetchone()[0] == 1
    assert c.conn.execute("update public.attempts set duration_seconds=1 where id=%s", (aid,)).rowcount == 0
    assert c.conn.execute("delete from public.attempts where id=%s", (aid,)).rowcount == 0
    c.as_(anna)
    assert c.conn.execute("update public.attempts set duration_seconds=2900 where id=%s", (aid,)).rowcount == 1
    raises(c, E.InsufficientPrivilege, "update public.attempts set team_size=4 where id=%s", aid)
    raises(c, E.InsufficientPrivilege, "update public.attempts set created_by=%s where id=%s", anna, aid)
    assert c.conn.execute("delete from public.attempts where id=%s", (aid,)).rowcount == 1

@test
def versuch_im_namen_anderer_wird_verhindert(c):
    anna = c.user("Anna"); bea = c.user("Bea"); p = c.puzzle(anna); c.as_(anna)
    raises(c, E.Error, "insert into public.attempts (puzzle_id, duration_seconds, created_by) values (%s, 3000, %s)", p, bea)

@test
def einzelversuch_nur_fuer_sich_teamversuch_mit_anderen(c):
    anna = c.user("Anna"); bea = c.user("Bea"); p = c.puzzle(anna)
    c.as_(anna)
    raises(c, E.RaiseException, "select public.add_attempt(%s, current_date, 3000, 'training', 1::smallint, null, null, %s::uuid[])", p, [anna, bea])
    raises(c, E.RaiseException, "select public.add_attempt(%s, current_date, 3000, 'training', 4::smallint, null, null, %s::uuid[])", p, [bea])
    c.conn.execute("select public.add_attempt(%s, current_date, 3000, 'training', 4::smallint, null, null, %s::uuid[])", (p, [anna, bea]))

@test
def ungueltige_dauer_wird_abgelehnt(c):
    anna = c.user("Anna"); p = c.puzzle(anna)
    for bad in (0, -5, 200000):
        raises(c, E.CheckViolation, "insert into public.attempts (puzzle_id, duration_seconds, created_by) values (%s, %s, %s)", p, bad, anna)

# ---------------- Veranstaltungen, Benachrichtigungen, Storage ----------------
@test
def veranstaltungen_nur_admin_schreibbar(c):
    anna = c.user("Anna"); adm = c.user("Admin", role="admin")
    c.as_(anna)
    raises(c, E.Error, "insert into public.events (name, year) values ('SPM', 2026)")
    c.as_(adm)
    c.conn.execute("insert into public.events (name, year) values ('SPM', 2026)")
    c.as_(anna)
    assert c.conn.execute("select count(*) from public.events").fetchone()[0] == 1

@test
def offizielles_resultat_prueft_status_und_zeit(c):
    adm = c.user("Admin", role="admin")
    ev = c.sql("insert into public.events (name, year) values ('SPM', 2026) returning id").fetchone()[0]
    rd = c.sql("insert into public.rounds (event_id, name, team_size) values (%s,'Teams Finale',4) returning id", ev).fetchone()[0]
    c.sql("insert into public.official_results (round_id, rank, entry_name, status, finish_seconds) values (%s,1,'A','finished',3483)", rd)
    c.sql("insert into public.official_results (round_id, rank, entry_name, status, pieces_placed) values (%s,51,'B','unfinished',992)", rd)
    raises(c, E.CheckViolation, "insert into public.official_results (round_id, rank, entry_name, status) values (%s,2,'C','finished')", rd)
    raises(c, E.CheckViolation, "insert into public.official_results (round_id, rank, entry_name, status, finish_seconds) values (%s,3,'D','unfinished',100)", rd)

@test
def benachrichtigungen_nur_eigene(c):
    anna = c.user("Anna"); bea = c.user("Bea")
    c.sql("insert into public.notifications (user_id, type) values (%s,'test')", anna)
    c.as_(bea)
    assert c.conn.execute("select count(*) from public.notifications").fetchone()[0] == 0
    raises(c, E.Error, "insert into public.notifications (user_id, type) values (%s,'x')", bea)
    c.as_(anna)
    assert c.conn.execute("select count(*) from public.notifications").fetchone()[0] == 1

@test
def foto_upload_nur_im_eigenen_ordner_und_nur_freigegeben(c):
    anna = c.user("Anna"); bea = c.user("Bea"); neu = c.user("Neu", status="pending")
    c.as_(anna)
    c.conn.execute("insert into storage.objects (bucket_id, name) values ('puzzle-images', %s)", (f"{anna}/a.webp",))
    raises(c, E.Error, "insert into storage.objects (bucket_id, name) values ('puzzle-images', %s)", f"{bea}/b.webp")
    c.as_(neu)
    raises(c, E.Error, "insert into storage.objects (bucket_id, name) values ('puzzle-images', %s)", f"{neu}/c.webp")

# ---------------- Phase 3: Puzzle erfassen ----------------
@test
def add_puzzle_legt_puzzle_und_exemplar_an(c):
    anna = c.user("Anna"); c.as_(anna)
    pid = c.conn.execute("select public.add_puzzle(' Alpenpanorama ', 'Ravensburger', '17000', 1000)").fetchone()[0]
    assert c.conn.execute("select title, created_by from public.puzzles where id=%s", (pid,)).fetchone() == ("Alpenpanorama", anna)
    assert c.conn.execute("select owner_id from public.copies where puzzle_id=%s", (pid,)).fetchone()[0] == anna

@test
def add_puzzle_ohne_exemplar_und_mit_pruefungen(c):
    anna = c.user("Anna"); c.as_(anna)
    pid = c.conn.execute("select public.add_puzzle('X', null, null, 500, null, null, null, false)").fetchone()[0]
    assert c.conn.execute("select count(*) from public.copies where puzzle_id=%s", (pid,)).fetchone()[0] == 0
    raises(c, E.RaiseException, "select public.add_puzzle('   ', null, null, 500)")
    raises(c, E.RaiseException, "select public.add_puzzle('Y', null, null, 0)")
    raises(c, E.RaiseException, "select public.add_puzzle('Y', null, null, 100, 'fremder-ordner/bild.webp')")

@test
def add_puzzle_doppelte_marke_und_nummer_gibt_klare_meldung(c):
    anna = c.user("Anna"); c.as_(anna)
    c.conn.execute("select public.add_puzzle('A', 'Ravensburger', '17000', 1000)")
    c.conn.execute("savepoint s")
    try:
        c.conn.execute("select public.add_puzzle('B', 'ravensburger ', '17000', 1000)")
        raise AssertionError("keine Ausnahme")
    except E.RaiseException as e:
        assert "gibt es schon" in str(e)
        c.conn.execute("rollback to savepoint s")

@test
def add_puzzle_nur_fuer_freigegebene(c):
    neu = c.user("Neu", status="pending"); c.as_(neu)
    raises(c, E.InsufficientPrivilege, "select public.add_puzzle('A', null, null, 100)")

@test
def add_puzzle_verknuepft_veranstaltung_und_verhindert_konflikte(c):
    anna = c.user("Anna"); c.as_(anna)
    p1 = c.conn.execute("select public.add_puzzle('A', null, null, 1000, null, null, null, true, 'SPM', 2026, 'Teams Finale', 4::smallint, 'https://example.org/res')").fetchone()[0]
    row = c.conn.execute("select e.name, e.year, r.name, r.team_size, r.piece_count, r.puzzle_id, r.results_url from public.rounds r join public.events e on e.id=r.event_id").fetchone()
    assert row == ("SPM", 2026, "Teams Finale", 4, 1000, p1, "https://example.org/res"), row
    raises(c, E.RaiseException, "select public.add_puzzle('B', null, null, 1000, null, null, null, true, ' spm ', 2026, 'teams finale', 4::smallint)")
    raises(c, E.RaiseException, "select public.add_puzzle('C', null, null, 1000, null, null, null, true, 'SPM', null, 'Finale', 4::smallint)")
    raises(c, E.RaiseException, "select public.add_puzzle('D', null, null, 1000, null, null, null, true, 'SPM', 2026, 'Finale', 4::smallint, 'javascript:alert(1)')")

@test
def link_puzzle_to_round_nur_fuer_berechtigte(c):
    anna = c.user("Anna"); bea = c.user("Bea"); adm = c.user("Admin", role="admin")
    p = c.puzzle(anna)
    c.as_(bea)
    raises(c, E.InsufficientPrivilege, "select public.link_puzzle_to_round(%s, 'SPM', 2026, 'Finale', 1::smallint)", p)
    c.as_(anna)
    c.conn.execute("select public.link_puzzle_to_round(%s, 'SPM', 2026, 'Finale', 1::smallint)", (p,))
    c.as_(adm)
    c.conn.execute("select public.link_puzzle_to_round(%s, 'SPM', 2026, 'Qualifikation', 1::smallint)", (p,))

@test
def aehnliche_puzzles_werden_gefunden(c):
    anna = c.user("Anna")
    c.puzzle(anna, title="Alpenpanorama bei Sonnenaufgang", brand="Ravensburger", no="17000", pieces=1000)
    c.as_(anna)
    same = c.conn.execute("select reason, score from public.find_similar_puzzles('Anderer Titel', 'ravensburger', '17000', 500)").fetchall()
    assert same and same[0][0] == "same_product_no" and same[0][1] == 1.0, same
    sim = c.conn.execute("select reason from public.find_similar_puzzles('Alpenpanorama bei Sonnenaufgang!', null, null, 1000)").fetchall()
    assert sim and sim[0][0] == "similar_title", sim
    none = c.conn.execute("select * from public.find_similar_puzzles('Katzen im Garten', 'Heye', '999', 2000)").fetchall()
    assert none == [], none

@test
def teilezahl_nicht_mehr_aenderbar_nach_erfassten_zeiten(c):
    anna = c.user("Anna"); p = c.puzzle(anna, pieces=1000)
    c.as_(anna)
    assert c.conn.execute("update public.puzzles set piece_count=1000, notes='ok' where id=%s", (p,)).rowcount == 1
    assert c.conn.execute("update public.puzzles set piece_count=500 where id=%s", (p,)).rowcount == 1
    c.attempt(anna, p, 3000)
    c.as_(anna)
    raises(c, E.RaiseException, "update public.puzzles set piece_count=900 where id=%s", p)

# ---------------- Phase 3: Versuche erfassen ----------------
@test
def add_attempt_einzelversuch_standardmaessig_fuer_sich(c):
    anna = c.user("Anna"); p = c.puzzle(anna); c.as_(anna)
    aid = c.conn.execute("select public.add_attempt(%s, '2026-05-01', 3000)", (p,)).fetchone()[0]
    assert c.conn.execute("select profile_id from public.attempt_participants where attempt_id=%s", (aid,)).fetchall() == [(anna,)]
    assert c.conn.execute("select kind, team_size from public.attempts where id=%s", (aid,)).fetchone() == ("training", 1)

@test
def add_attempt_prueft_eingaben(c):
    anna = c.user("Anna"); bea = c.user("Bea"); neu = c.user("Neu", status="pending"); p = c.puzzle(anna); c.as_(anna)
    q = "select public.add_attempt(%s, %s, %s, 'training', %s::smallint, null, null, %s::uuid[])"
    raises(c, E.RaiseException, q, p, "2999-01-01", 3000, 1, None)         # Zukunft
    raises(c, E.RaiseException, q, p, "2026-01-01", 0, 1, None)            # Dauer
    raises(c, E.RaiseException, q, p, "2026-01-01", 3000, 4, [bea])        # man selbst fehlt
    raises(c, E.RaiseException, q, p, "2026-01-01", 3000, 2, [anna, bea, neu])  # mehr als Teamgrösse
    raises(c, E.RaiseException, q, p, "2026-01-01", 3000, 4, [anna, neu])  # nicht freigegeben
    raises(c, E.RaiseException, q, "00000000-0000-0000-0000-000000000000", "2026-01-01", 3000, 1, None)

@test
def add_attempt_team_darf_kleiner_besetzt_sein_als_teamgroesse(c):
    anna = c.user("Anna"); bea = c.user("Bea"); p = c.puzzle(anna); c.as_(anna)
    aid = c.conn.execute("select public.add_attempt(%s, '2026-05-01', 4000, 'training', 4::smallint, null, null, %s::uuid[])", (p, [anna, bea])).fetchone()[0]
    assert c.conn.execute("select count(*) from public.attempt_participants where attempt_id=%s", (aid,)).fetchone()[0] == 2

@test
def add_attempt_mit_runde_prueft_puzzle_teamgroesse_und_art(c):
    anna = c.user("Anna"); p = c.puzzle(anna); other = c.puzzle(anna, title="Anderes", no="2", brand="Heye")
    c.as_(anna)
    c.conn.execute("select public.link_puzzle_to_round(%s, 'SPM', 2026, 'Finale', 1::smallint)", (p,))
    rid = c.conn.execute("select id from public.rounds").fetchone()[0]
    q = "select public.add_attempt(%s, '2026-05-01', 3000, %s, %s::smallint, %s)"
    c.conn.execute(q, (p, "official", 1, rid))
    raises(c, E.RaiseException, q, p, "training", 1, rid)    # Art muss offiziell sein
    raises(c, E.RaiseException, q, p, "official", 4, rid)    # Teamgrösse passt nicht
    raises(c, E.RaiseException, q, other, "official", 1, rid)  # falsches Puzzle

@test
def direkte_inserts_auf_versuche_sind_gesperrt(c):
    anna = c.user("Anna"); p = c.puzzle(anna); c.as_(anna)
    raises(c, E.InsufficientPrivilege, "insert into public.attempts (puzzle_id, duration_seconds, created_by) values (%s, 3000, %s)", p, anna)
    raises(c, E.InsufficientPrivilege, "insert into public.attempt_participants values (gen_random_uuid(), %s)", anna)

# ---------------- Phase 3: Ranglisten und Statistiken ----------------
@test
def rangliste_gleichstand_ueberspringt_rang_und_rechnet_teile_pro_minute(c):
    names = ["Anna", "Bea", "Cor", "Dani", "Eva"]; u = {n: c.user(n) for n in names}
    p = c.puzzle(u["Anna"], pieces=1000)
    for n, sec in [("Anna", 3000), ("Bea", 3300), ("Cor", 3300), ("Dani", 3600)]:
        c.attempt(u[n], p, sec)
    c.attempt(u["Anna"], p, 3200)  # zweiter, schlechterer Versuch zählt nur als Versuch
    c.as_(u["Eva"])
    rows = c.conn.execute("select rank, display_name, best_seconds, pieces_per_minute, attempts_count from public.puzzle_leaderboard(%s)", (p,)).fetchall()
    assert [(r[0], r[1]) for r in rows] == [(1, "Anna"), (2, "Bea"), (2, "Cor"), (4, "Dani")], rows
    assert float(rows[0][3]) == 20.0 and rows[0][4] == 2, rows[0]       # 1000 / 50 min = 20
    assert float(rows[3][3]) == round(1000 / 60, 2)

@test
def rangliste_trennt_offizielle_und_training_sowie_einzel_und_team(c):
    anna = c.user("Anna"); bea = c.user("Bea"); p = c.puzzle(anna)
    c.attempt(anna, p, 3000, kind="training")
    c.attempt(anna, p, 3500, kind="official")
    c.attempt(bea, p, 3200, kind="official")
    c.attempt(anna, p, 1000, team=4, parts=[anna, bea])   # Teamzeit darf die Einzelrangliste nicht beeinflussen
    c.as_(bea)
    alle = c.conn.execute("select display_name, best_seconds from public.puzzle_leaderboard(%s, false)", (p,)).fetchall()
    off = c.conn.execute("select display_name, best_seconds from public.puzzle_leaderboard(%s, true)", (p,)).fetchall()
    assert alle == [("Anna", 3000), ("Bea", 3200)], alle
    assert off == [("Bea", 3200), ("Anna", 3500)], off

@test
def team_rangliste_gruppiert_nach_besetzung(c):
    anna = c.user("Anna"); bea = c.user("Bea"); cor = c.user("Cor"); p = c.puzzle(anna, pieces=1000)
    c.attempt(anna, p, 4000, team=4, parts=[anna, bea])
    c.attempt(anna, p, 3600, team=4, parts=[anna, bea])
    c.attempt(cor, p, 3000, team=4, parts=[cor])
    c.attempt(anna, p, 2000, team=1)
    c.as_(bea)
    rows = c.conn.execute("select rank, team_names, best_seconds, attempts_count from public.puzzle_team_leaderboard(%s, 4::smallint)", (p,)).fetchall()
    assert rows == [(1, "Cor", 3000, 1), (2, "Anna, Bea", 3600, 2)], rows

@test
def statistik_rechnet_gewichtet_und_trennt_kennzahlen(c):
    anna = c.user("Anna"); a = c.puzzle(anna, title="Klein", no="1", pieces=100); b = c.puzzle(anna, title="Gross", no="2", pieces=1000)
    c.attempt(anna, a, 600); c.attempt(anna, b, 3000)          # 10 Teile/Min und 20 Teile/Min
    c.attempt(anna, b, 500, team=4)                             # Team: zählt nicht im Bereich «solo»
    c.as_(anna)
    r = c.conn.execute("select * from public.player_summary(%s, 'solo')", (anna,)).fetchone()
    attempts, distinct, avg_s, avg_p, tot_p, tot_s, ppm, best_ppm = r
    assert (attempts, distinct, avg_s, avg_p, tot_p, tot_s) == (2, 2, 1800, 550, 1100, 3600), r
    assert float(ppm) == round(1100 / 60, 2)          # gewichtet 18,33 – nicht der Mittelwert 15
    assert float(best_ppm) == 20.0
    t = c.conn.execute("select attempts_count, total_seconds from public.player_summary(%s, 'team')", (anna,)).fetchone()
    assert t == (1, 500)
    alle = c.conn.execute("select attempts_count from public.player_summary(%s, 'all')", (anna,)).fetchone()
    assert alle == (3,)
    leer = c.user("Leer")
    c.as_(anna)
    z = c.conn.execute("select attempts_count, avg_speed_ppm from public.player_summary(%s, 'solo')", (leer,)).fetchone()
    assert z == (0, None), z
    raises(c, E.RaiseException, "select * from public.player_summary(%s, 'unsinn')", anna)

@test
def beste_zeiten_pro_puzzle_mit_rang_im_vergleich(c):
    anna = c.user("Anna"); bea = c.user("Bea"); p = c.puzzle(anna, pieces=500)
    c.attempt(anna, p, 3000); c.attempt(anna, p, 2800); c.attempt(bea, p, 2500)
    c.as_(anna)
    r = c.conn.execute("select best_seconds, attempts_count, rank, members_count, fastest_seconds, best_ppm from public.player_puzzle_bests(%s, 'solo')", (anna,)).fetchone()
    assert r[:5] == (2800, 2, 2, 2, 2500), r
    assert float(r[5]) == round(500 / (2800 / 60), 2)

@test
def verlaufsdaten_sind_chronologisch(c):
    anna = c.user("Anna"); p = c.puzzle(anna, pieces=500)
    c.attempt(anna, p, 3000, day="2026-03-01"); c.attempt(anna, p, 2800, day="2026-01-01")
    c.as_(anna)
    rows = c.conn.execute("select solved_on, ppm from public.player_attempts(%s, 'solo')", (anna,)).fetchall()
    assert [str(r[0]) for r in rows] == ["2026-01-01", "2026-03-01"], rows

@test
def regal_zeigt_besessene_und_ausgeliehene_exemplare(c):
    anna = c.user("Anna"); bea = c.user("Bea"); cor = c.user("Cor")
    p1 = c.puzzle(anna, title="A", no="1", pieces=1000); p2 = c.puzzle(anna, title="B", no="2", pieces=500)
    c1 = c.copy(p1, anna); c.copy(p2, anna)
    c.sql("insert into public.loans (copy_id, borrower_id, status) values (%s,%s,'lent')", c1, bea)
    c.attempt(bea, p1, 4000); c.attempt(bea, p1, 3900)
    c.as_(cor)
    ann = c.conn.execute("select title, is_on_loan, holder_name, owner_name from public.shelf_items(%s)", (anna,)).fetchall()
    assert ann == [("B", False, "Anna", "Anna"), ("A", True, "Bea", "Anna")], ann   # sortiert nach Teilezahl
    b = c.conn.execute("select title, owner_name, best_seconds, attempts_count from public.shelf_items(%s)", (bea,)).fetchall()
    assert b == [("A", "Anna", 3900, 2)], b
    assert c.conn.execute("select count(*) from public.shelf_items(%s)", (cor,)).fetchone()[0] == 0

@test
def mitgliederuebersicht_nur_freigegebene(c):
    anna = c.user("Anna"); c.user("Wartet", status="pending"); c.user("Gesperrt", status="blocked")
    p = c.puzzle(anna); c.copy(p, anna); c.attempt(anna, p, 3000)
    c.as_(anna)
    rows = c.conn.execute("select display_name, copies_owned, copies_held, solved_puzzles, attempts_count from public.member_overview()").fetchall()
    assert rows == [("Anna", 1, 1, 1, 1)], rows

@test
def lesefunktionen_nur_fuer_freigegebene(c):
    anna = c.user("Anna"); neu = c.user("Neu", status="pending"); p = c.puzzle(anna)
    c.as_(neu)
    for q, a in [("select * from public.puzzle_list()", ()), ("select * from public.puzzle_leaderboard(%s)", (p,)),
                 ("select * from public.shelf_items(%s)", (anna,)), ("select * from public.member_overview()", ()),
                 ("select * from public.player_summary(%s)", (anna,)), ("select * from public.puzzle_attempts(%s)", (p,))]:
        raises(c, E.InsufficientPrivilege, q, *a)
    c.as_(None, "anon")
    raises(c, E.InsufficientPrivilege, "select * from public.puzzle_list()")

@test
def puzzle_liste_zaehlt_exemplare_loeser_und_bestzeit(c):
    anna = c.user("Anna"); bea = c.user("Bea"); p = c.puzzle(anna)
    c.copy(p, anna); c.copy(p, bea)
    c.attempt(anna, p, 3000); c.attempt(bea, p, 2900); c.attempt(anna, p, 100, team=4)
    c.as_(bea)
    r = c.conn.execute("select copies_count, solvers_count, best_seconds from public.puzzle_list()").fetchone()
    assert r == (2, 2, 2900), r

# ---------------- Phase 4: Ausleihe ----------------
def loan_setup(c, lendable=True):
    owner = c.user("Owner"); bor = c.user("Bor"); other = c.user("Other")
    pz = c.puzzle(owner, title="Alpen", pieces=1000); cp = c.copy(pz, owner)
    if not lendable:
        c.sql("update public.copies set is_lendable=false where id=%s", cp)
    return owner, bor, other, pz, cp

def call(c, uid, fn, *args):
    c.as_(uid)
    return c.conn.execute(f"select public.{fn}", args).fetchone()[0]

def status(c, loan):
    return c.sql("select status from public.loans where id=%s", loan).fetchone()[0]

@test
def anfrage_erstellt_ausleihe_und_benachrichtigt_den_eigentuemer(c):
    owner, bor, other, pz, cp = loan_setup(c)
    loan = call(c, bor, "request_loan(%s, ' Darf ich? ')", cp)
    assert status(c, loan) == "requested"
    n = c.sql("select user_id, type, payload->>'puzzle_title', payload->>'user_name', payload->>'borrower_name', payload->>'message' from public.notifications").fetchall()
    assert n == [(owner, "loan_requested", "Alpen", None, "Bor", "Darf ich?")], n

@test
def anfrage_regeln_eigenes_nicht_ausleihbar_doppelt_nachrichtenlaenge(c):
    owner, bor, other, pz, cp = loan_setup(c)
    c.as_(owner); raises(c, E.RaiseException, "select public.request_loan(%s)", cp)
    call(c, bor, "request_loan(%s)", cp)
    c.as_(bor); raises(c, E.RaiseException, "select public.request_loan(%s)", cp)
    c.as_(other); raises(c, E.RaiseException, "select public.request_loan(%s, %s)", cp, "x" * 501)
    owner2, bor2, other2, pz2, cp2 = loan_setup_second(c)

def loan_setup_second(c):
    a = c.user("Ann2"); b = c.user("Bob2"); pz = c.puzzle(a, title="Nicht", no="9", pieces=500); cp = c.copy(pz, a)
    c.sql("update public.copies set is_lendable=false where id=%s", cp)
    c.as_(b); raises(c, E.RaiseException, "select public.request_loan(%s)", cp)
    return a, b, None, pz, cp

@test
def anfrage_nur_fuer_freigegebene_und_nicht_anonym(c):
    owner, bor, other, pz, cp = loan_setup(c)
    neu = c.user("Neu", status="pending")
    c.as_(neu); raises(c, E.InsufficientPrivilege, "select public.request_loan(%s)", cp)
    c.as_(None, "anon"); raises(c, E.InsufficientPrivilege, "select public.request_loan(%s)", cp)

@test
def kompletter_ablauf_inklusive_standortwechsel(c):
    owner, bor, other, pz, cp = loan_setup(c)
    loan = call(c, bor, "request_loan(%s)", cp)
    call(c, owner, "respond_loan(%s, true)", loan)
    assert status(c, loan) == "accepted"
    # angenommen = nur reserviert: Standort bleibt beim Eigentümer
    c.as_(other)
    r = c.conn.execute("select holder_id, is_on_loan, is_reserved from public.copy_current_state where copy_id=%s", (cp,)).fetchone()
    assert r == (owner, False, True), r
    assert c.conn.execute("select count(*) from public.shelf_items(%s)", (bor,)).fetchone()[0] == 0
    call(c, owner, "confirm_handover(%s)", loan)
    c.as_(other)
    r = c.conn.execute("select holder_id, is_on_loan, is_reserved from public.copy_current_state where copy_id=%s", (cp,)).fetchone()
    assert r == (bor, True, False), r
    bor_shelf = c.conn.execute("select title, owner_name, holder_name from public.shelf_items(%s)", (bor,)).fetchall()
    own_shelf = c.conn.execute("select title, is_on_loan, holder_name from public.shelf_items(%s)", (owner,)).fetchall()
    assert bor_shelf == [("Alpen", "Owner", "Bor")] and own_shelf == [("Alpen", True, "Bor")], (bor_shelf, own_shelf)
    call(c, bor, "request_return(%s)", loan); assert status(c, loan) == "return_requested"
    c.as_(other)
    assert c.conn.execute("select is_on_loan from public.copy_current_state where copy_id=%s", (cp,)).fetchone()[0] is True
    call(c, owner, "confirm_return(%s)", loan); assert status(c, loan) == "returned"
    c.as_(other)
    assert c.conn.execute("select holder_id, is_on_loan from public.copy_current_state where copy_id=%s", (cp,)).fetchone() == (owner, False)
    assert c.conn.execute("select count(*) from public.shelf_items(%s)", (bor,)).fetchone()[0] == 0
    types = [r[0] for r in c.sql("select type from public.notifications order by created_at, id").fetchall()]
    assert sorted(types) == sorted(["loan_requested", "loan_accepted", "loan_handed_over", "loan_return_requested", "loan_returned"]), types
    pages = dict(c.sql("select type, payload->>'page' from public.notifications").fetchall())
    assert pages["loan_requested"] == "requests" and pages["loan_return_requested"] == "requests" and pages["loan_accepted"] == "mine" and pages["loan_returned"] == "mine", pages

@test
def nur_der_eigentuemer_darf_antworten_und_uebergabe_bestaetigen(c):
    owner, bor, other, pz, cp = loan_setup(c)
    loan = call(c, bor, "request_loan(%s)", cp)
    for uid in (bor, other):
        c.as_(uid); raises(c, E.InsufficientPrivilege, "select public.respond_loan(%s, true)", loan)
    call(c, owner, "respond_loan(%s, true)", loan)
    for uid in (bor, other):
        c.as_(uid); raises(c, E.InsufficientPrivilege, "select public.confirm_handover(%s)", loan)
    call(c, owner, "confirm_handover(%s)", loan)
    for uid in (bor, other):
        c.as_(uid); raises(c, E.InsufficientPrivilege, "select public.confirm_return(%s)", loan)

@test
def ungueltige_statuswechsel_werden_abgelehnt(c):
    owner, bor, other, pz, cp = loan_setup(c)
    loan = call(c, bor, "request_loan(%s)", cp)
    c.as_(owner)
    raises(c, E.RaiseException, "select public.confirm_handover(%s)", loan)       # noch nicht angenommen
    raises(c, E.RaiseException, "select public.confirm_return(%s)", loan)
    raises(c, E.RaiseException, "select public.request_return(%s)", loan)
    call(c, owner, "respond_loan(%s, false)", loan); assert status(c, loan) == "declined"
    c.as_(owner); raises(c, E.RaiseException, "select public.respond_loan(%s, true)", loan)   # nicht mehr offen
    c.as_(bor); raises(c, E.RaiseException, "select public.cancel_loan(%s)", loan)            # abgelehnt: nichts mehr zu stornieren

@test
def zweite_zusage_fuer_dasselbe_exemplar_wird_verhindert(c):
    owner, bor, other, pz, cp = loan_setup(c)
    l1 = call(c, bor, "request_loan(%s)", cp); l2 = call(c, other, "request_loan(%s)", cp)
    call(c, owner, "respond_loan(%s, true)", l1)
    c.as_(owner)
    raises(c, E.RaiseException, "select public.respond_loan(%s, true)", l2)
    assert status(c, l2) == "requested"
    # copy_busy meldet der Oberfläche, dass die zweite Anfrage warten muss
    rows = c.conn.execute("select loan_id, copy_busy from public.my_loans() order by requested_at").fetchall()
    assert rows == [(l1, False), (l2, True)] or sorted(rows, key=lambda r: str(r[0])) == sorted([(l1, False), (l2, True)], key=lambda r: str(r[0])), rows
    # nach Rückgabe kann die zweite angenommen werden
    call(c, owner, "confirm_handover(%s)", l1); call(c, owner, "confirm_return(%s)", l1)
    call(c, owner, "respond_loan(%s, true)", l2); assert status(c, l2) == "accepted"

@test
def stornieren_durch_ausleihende_und_eigentuemer(c):
    owner, bor, other, pz, cp = loan_setup(c)
    l1 = call(c, bor, "request_loan(%s)", cp)
    call(c, bor, "cancel_loan(%s)", l1); assert status(c, l1) == "cancelled"
    l2 = call(c, bor, "request_loan(%s)", cp)
    c.as_(owner); raises(c, E.InsufficientPrivilege, "select public.cancel_loan(%s)", l2)      # Anfrage: Eigentümer lehnt ab statt zu stornieren
    call(c, owner, "respond_loan(%s, true)", l2)
    c.as_(other); raises(c, E.InsufficientPrivilege, "select public.cancel_loan(%s)", l2)
    call(c, owner, "cancel_loan(%s)", l2); assert status(c, l2) == "cancelled"
    l3 = call(c, bor, "request_loan(%s)", cp); call(c, owner, "respond_loan(%s, true)", l3); call(c, owner, "confirm_handover(%s)", l3)
    c.as_(bor); raises(c, E.RaiseException, "select public.cancel_loan(%s)", l3)               # nach Übergabe nicht mehr

@test
def rueckgabe_durch_eigentuemer_direkt_und_nur_beteiligte_fragen_an(c):
    owner, bor, other, pz, cp = loan_setup(c)
    loan = call(c, bor, "request_loan(%s)", cp); call(c, owner, "respond_loan(%s, true)", loan); call(c, owner, "confirm_handover(%s)", loan)
    c.as_(other); raises(c, E.InsufficientPrivilege, "select public.request_return(%s)", loan)
    call(c, owner, "confirm_return(%s)", loan); assert status(c, loan) == "returned"      # ohne Anfrage der ausleihenden Person

@test
def admin_darf_haengende_ausleihen_abschliessen(c):
    owner, bor, other, pz, cp = loan_setup(c); adm = c.user("Adm", role="admin")
    loan = call(c, bor, "request_loan(%s)", cp)
    call(c, adm, "respond_loan(%s, true)", loan); call(c, adm, "confirm_handover(%s)", loan); call(c, adm, "confirm_return(%s)", loan)
    assert status(c, loan) == "returned"

@test
def ausleihen_sehen_nur_beteiligte_alle_nur_admin(c):
    owner, bor, other, pz, cp = loan_setup(c); adm = c.user("Adm", role="admin")
    call(c, bor, "request_loan(%s)", cp)
    for uid, expected in [(owner, 1), (bor, 1), (other, 0)]:
        c.as_(uid); assert c.conn.execute("select count(*) from public.my_loans()").fetchone()[0] == expected, uid
    c.as_(other); raises(c, E.InsufficientPrivilege, "select * from public.my_loans(true)")
    c.as_(adm); assert c.conn.execute("select count(*) from public.my_loans(true)").fetchone()[0] == 1
    assert c.conn.execute("select count(*) from public.my_loans()").fetchone()[0] == 0

@test
def mitteilungen_gehen_an_die_richtige_person_und_koennen_gelesen_werden(c):
    owner, bor, other, pz, cp = loan_setup(c)
    loan = call(c, bor, "request_loan(%s)", cp); call(c, owner, "respond_loan(%s, true)", loan)
    for uid, types in [(owner, ["loan_requested"]), (bor, ["loan_accepted"]), (other, [])]:
        c.as_(uid)
        assert [r[0] for r in c.conn.execute("select type from public.notifications").fetchall()] == types
    c.as_(bor)
    assert c.conn.execute("update public.notifications set read_at = now() where read_at is null").rowcount == 1
    raises(c, E.InsufficientPrivilege, "update public.notifications set payload = '{}'::jsonb")

@test
def eigentumswechsel_mit_verlauf_und_schutz(c):
    owner, bor, other, pz, cp = loan_setup(c)
    c.as_(other); raises(c, E.InsufficientPrivilege, "select public.transfer_copy(%s, %s)", cp, other)
    c.as_(owner)
    raises(c, E.RaiseException, "select public.transfer_copy(%s, %s)", cp, owner)
    pending = c.user("Pending", status="pending")
    raises(c, E.RaiseException, "select public.transfer_copy(%s, %s)", cp, pending)
    loan = call(c, bor, "request_loan(%s)", cp)
    c.as_(owner); raises(c, E.RaiseException, "select public.transfer_copy(%s, %s)", cp, other)   # offene Anfrage
    call(c, bor, "cancel_loan(%s)", loan)
    call(c, owner, "transfer_copy(%s, %s)", cp, other)
    assert c.sql("select owner_id from public.copies where id=%s", cp).fetchone()[0] == other
    hist = c.sql("select from_owner_id, to_owner_id from public.ownership_history where copy_id=%s order by changed_at, id", cp).fetchall()
    assert hist == [(None, owner), (owner, other)], hist
    c.as_(other)
    assert [r[0] for r in c.conn.execute("select type from public.notifications").fetchall()] == ["copy_transferred"]
    c.as_(owner); raises(c, E.InsufficientPrivilege, "select public.transfer_copy(%s, %s)", cp, owner)   # nicht mehr Eigentümer

@test
def neues_exemplar_schreibt_eigentumsverlauf(c):
    anna = c.user("Anna"); c.as_(anna)
    pid = c.conn.execute("select public.add_puzzle('A', null, null, 100)").fetchone()[0]
    assert c.conn.execute("select count(*) from public.ownership_history").fetchone()[0] == 1
    raises(c, E.InsufficientPrivilege, "insert into public.ownership_history (copy_id, to_owner_id) select id, %s from public.copies", anna)

@test
def ausleihbar_umschalten_nur_eigentuemer(c):
    owner, bor, other, pz, cp = loan_setup(c)
    c.as_(owner); assert c.conn.execute("update public.copies set is_lendable=false where id=%s", (cp,)).rowcount == 1
    c.as_(bor); assert c.conn.execute("update public.copies set is_lendable=true where id=%s", (cp,)).rowcount == 0

if __name__ == "__main__":
    setup()
    results = run_all()
    for name, ok, msg in results:
        print(("OK     " if ok else "FEHLER ") + name + ("" if ok else f"  -> {msg}"))
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} von {len(results)} Tests bestanden")
    sys.exit(1 if failed else 0)
