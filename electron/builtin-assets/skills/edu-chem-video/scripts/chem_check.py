"""Chemistry verification for step 1 (no third-party packages: pure Python fractions).

  PY chem_check.py balance "Cu + HNO3 -> Cu(NO3)2 + NO + H2O"
      -> smallest integer coefficients, per-element atom tally (left/right), charge check, molar masses
  PY chem_check.py mass "CuSO4·5H2O" "Cu(NO3)2"
      -> molar masses with the textbook relative atomic masses (H 1, C 12, N 14, O 16, Cu 64, ...)
  PY chem_check.py check "3Cu + 8HNO3 = 3Cu(NO3)2 + 2NO + 4H2O"
      -> verifies a GIVEN balanced equation (atoms + charge), exit 1 if it does not balance

Formulas: parentheses / brackets, hydrates with · or *, charges as ^{2+} / ^- (e.g. "Fe^{3+}", "SO4^{2-}", "e^-").
Arrows accepted: -> = → ⇌ <=>. State marks (↑ ↓ (aq) (g) (s) (l)) are ignored.
Electron transfer is NOT computed here (oxidation states need chemistry judgement): work it out by hand and
check it against the balanced coefficients (electrons lost = electrons gained).
"""
import re, sys
from fractions import Fraction
from math import gcd

AR = {"H": 1, "He": 4, "Li": 7, "C": 12, "N": 14, "O": 16, "F": 19, "Na": 23, "Mg": 24, "Al": 27, "Si": 28,
      "P": 31, "S": 32, "Cl": 35.5, "K": 39, "Ca": 40, "Mn": 55, "Fe": 56, "Cu": 64, "Zn": 65, "Br": 80,
      "Ag": 108, "I": 127, "Ba": 137, "Cr": 52, "Ni": 59, "Pb": 207, "Hg": 201, "Ti": 48, "B": 11, "Be": 9, "Ar": 40}


def parse(f):
    """formula -> ({element: count}, charge)"""
    f = f.strip()
    f = re.sub(r"\((aq|g|s|l)\)$", "", f).replace("↑", "").replace("↓", "").replace("(稀)", "").replace("(浓)", "")
    charge = 0
    m = re.search(r"\^\{?(\d*)([+-])\}?$", f)
    if m:
        charge = int(m.group(1) or 1) * (1 if m.group(2) == "+" else -1)
        f = f[:m.start()]
    if f == "e":
        return {}, charge
    total = {}
    for part in re.split(r"[·*]", f):
        mm = re.match(r"^(\d+)(.*)$", part)
        mult, part = (int(mm.group(1)), mm.group(2)) if mm else (1, part)
        for el, n in _group(part).items():
            total[el] = total.get(el, 0) + n * mult
    return total, charge


def _group(s):
    stack, i = [{}], 0
    while i < len(s):
        c = s[i]
        if c in "([":
            stack.append({}); i += 1
        elif c in ")]":
            i += 1
            m = re.match(r"\d+", s[i:]); n = int(m.group()) if m else 1; i += len(m.group()) if m else 0
            top = stack.pop()
            for el, k in top.items():
                stack[-1][el] = stack[-1].get(el, 0) + k * n
        else:
            m = re.match(r"([A-Z][a-z]?)(\d*)", s[i:])
            if not m:
                raise SystemExit(f"cannot parse formula near '{s[i:]}'")
            el, n = m.group(1), int(m.group(2) or 1)
            stack[-1][el] = stack[-1].get(el, 0) + n
            i += len(m.group())
    return stack[0]


def split_eq(eq):
    parts = re.split(r"\s*(?:->|=|→|⇌|<=>)\s*", eq)
    if len(parts) != 2:
        raise SystemExit("need exactly one arrow ( -> = → ⇌ )")
    side = lambda s: [t.strip() for t in re.split(r"\s+\+\s+", s.strip()) if t.strip()]  # noqa: E731
    return side(parts[0]), side(parts[1])


def coef_split(term):
    m = re.match(r"^(\d+)\s*(.*)$", term)
    return (int(m.group(1)), m.group(2)) if m else (1, term)


def nullspace_int(M):
    """one integer vector in the nullspace of M (rows = elements + charge, cols = species), smallest positive"""
    rows, cols = len(M), len(M[0])
    A = [[Fraction(x) for x in r] for r in M]
    piv, r = [], 0
    for c in range(cols):
        p = next((i for i in range(r, rows) if A[i][c] != 0), None)
        if p is None:
            continue
        A[r], A[p] = A[p], A[r]
        A[r] = [x / A[r][c] for x in A[r]]
        for i in range(rows):
            if i != r and A[i][c] != 0:
                A[i] = [a - A[i][c] * b for a, b in zip(A[i], A[r])]
        piv.append(c); r += 1
    free = [c for c in range(cols) if c not in piv]
    if len(free) != 1:
        raise SystemExit(f"{len(free)} degrees of freedom: the equation is not uniquely balanceable "
                         "(several independent reactions?) — balance it by electron transfer by hand")
    v = [Fraction(0)] * cols; v[free[0]] = Fraction(1)
    for i, c in enumerate(piv):
        v[c] = -A[i][free[0]]
    den = 1
    for x in v:
        den = den * x.denominator // gcd(den, x.denominator)
    ints = [int(x * den) for x in v]
    g = 0
    for x in ints:
        g = gcd(g, abs(x))
    ints = [x // g for x in ints]
    if all(x <= 0 for x in ints):
        ints = [-x for x in ints]
    return ints


def molar(f):
    comp, _ = parse(f)
    missing = [e for e in comp if e not in AR]
    if missing:
        return None
    return sum(AR[e] * n for e, n in comp.items())


def report(L, R, k):
    species = L + R
    els = sorted({e for s in species for e in parse(s)[0]})
    ok = True
    print("\natom tally (left | right):")
    for e in els:
        l = sum(k[i] * parse(s)[0].get(e, 0) for i, s in enumerate(L))
        r = sum(k[len(L) + i] * parse(s)[0].get(e, 0) for i, s in enumerate(R))
        ok &= l == r
        print(f"  {e:3s} {l:4d} | {r:<4d} {'✓' if l == r else '✗'}")
    ql = sum(k[i] * parse(s)[1] for i, s in enumerate(L)); qr = sum(k[len(L) + i] * parse(s)[1] for i, s in enumerate(R))
    ok &= ql == qr
    print(f"  charge {ql:+d} | {qr:+d} {'✓' if ql == qr else '✗'}")
    print("\nmolar masses (g/mol):")
    for s in species:
        m = molar(s)
        if parse(s)[0]:
            print(f"  {s:14s} {m if m is not None else '? (add element to AR)'}")
    return ok


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    mode = sys.argv[1]
    if mode == "mass":
        for f in sys.argv[2:]:
            print(f"{f}: {molar(f)} g/mol")
        return
    L, R = split_eq(sys.argv[2])
    if mode == "balance":
        L = [coef_split(t)[1] for t in L]; R = [coef_split(t)[1] for t in R]
        species = L + R
        els = sorted({e for s in species for e in parse(s)[0]})
        M = [[parse(s)[0].get(e, 0) * (1 if i < len(L) else -1) for i, s in enumerate(species)] for e in els]
        M.append([parse(s)[1] * (1 if i < len(L) else -1) for i, s in enumerate(species)])
        k = nullspace_int(M)
        side = lambda ss, kk: " + ".join((str(c) if c != 1 else "") + s for c, s in zip(kk, ss))  # noqa: E731
        print("balanced:", side(L, k[:len(L)]), "=", side(R, k[len(L):]))
        print("coefficients:", k)
        report(L, R, k)
    elif mode == "check":
        Lc = [coef_split(t) for t in L]; Rc = [coef_split(t) for t in R]
        k = [c for c, _ in Lc + Rc]
        ok = report([s for _, s in Lc], [s for _, s in Rc], k)
        print("\nBALANCED" if ok else "\nNOT BALANCED")
        sys.exit(0 if ok else 1)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
