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
        conn.execute("drop schema if exists auth cascade; drop schema if exists storage cascade;")
        conn.execute("drop role if exists anon; drop role if exists authenticated;")
        for f in ["00_stubs.sql", "../migrations/0001_schema.sql", "../migrations/0002_storage.sql"]:
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
def puzzle_nur_im_eigenen_namen_erfassen(c):
    anna = c.user("Anna"); bea = c.user("Bea"); c.as_(anna)
    raises(c, E.Error, "insert into public.puzzles (title, piece_count, created_by) values ('x', 10, %s)", bea)
    c.conn.execute("insert into public.puzzles (title, piece_count, created_by) values ('x', 10, %s)", (anna,))

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
    c.as_(anna)
    aid = c.conn.execute("insert into public.attempts (puzzle_id, duration_seconds, created_by) values (%s, 3000, %s) returning id", (p, anna)).fetchone()[0]
    c.conn.execute("insert into public.attempt_participants values (%s,%s)", (aid, anna))
    c.as_(bea)
    assert c.conn.execute("select count(*) from public.attempts").fetchone()[0] == 1
    assert c.conn.execute("update public.attempts set duration_seconds=1 where id=%s", (aid,)).rowcount == 0
    assert c.conn.execute("delete from public.attempts where id=%s", (aid,)).rowcount == 0

@test
def versuch_im_namen_anderer_wird_verhindert(c):
    anna = c.user("Anna"); bea = c.user("Bea"); p = c.puzzle(anna); c.as_(anna)
    raises(c, E.Error, "insert into public.attempts (puzzle_id, duration_seconds, created_by) values (%s, 3000, %s)", p, bea)

@test
def einzelversuch_nur_fuer_sich_teamversuch_mit_anderen(c):
    anna = c.user("Anna"); bea = c.user("Bea"); p = c.puzzle(anna); c.as_(anna)
    solo = c.conn.execute("insert into public.attempts (puzzle_id, duration_seconds, created_by, team_size) values (%s, 3000, %s, 1) returning id", (p, anna)).fetchone()[0]
    raises(c, E.Error, "insert into public.attempt_participants values (%s,%s)", solo, bea)
    team = c.conn.execute("insert into public.attempts (puzzle_id, duration_seconds, created_by, team_size) values (%s, 3000, %s, 4) returning id", (p, anna)).fetchone()[0]
    c.conn.execute("insert into public.attempt_participants values (%s,%s)", (team, bea))

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

if __name__ == "__main__":
    setup()
    results = run_all()
    for name, ok, msg in results:
        print(("OK     " if ok else "FEHLER ") + name + ("" if ok else f"  -> {msg}"))
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} von {len(results)} Tests bestanden")
    sys.exit(1 if failed else 0)
