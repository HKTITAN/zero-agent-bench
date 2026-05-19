#!/bin/bash
# Probe each candidate code: does `zero explain X` return a known explanation?
export PATH="$HOME/.zero/bin:$PATH"

# Codes we've seen emitted by `zero check --json` (from benchmark raw data and skills docs)
CODES=(
  PAR100
  STD001 STD002 STD003 STD004
  TYP001 TYP002 TYP003 TYP004 TYP005 TYP006 TYP007 TYP008 TYP009 TYP021 TYP023
  NAM001 NAM002 NAM003 NAM004 NAM005
  IMP001 IMP002 IMP003
  PKG001 PKG002 PKG003 PKG004
  TAR001 TAR002 TAR003
  BLD001 BLD002 BLD003 BLD004
  CGEN001 CGEN002 CGEN003 CGEN004
  BOR001 BOR002
  ERR001 ERR002 ERR003
  CHECK001
)

known=()
unknown=()
for c in "${CODES[@]}"; do
  out=$(zero explain "$c" 2>&1 | head -1)
  if echo "$out" | grep -q "NAM003: unknown diagnostic code"; then
    unknown+=("$c")
  elif echo "$out" | grep -q "^$c"; then
    known+=("$c")
  else
    # Could be some other status; treat as unknown for the purposes of this probe
    unknown+=("$c?")
  fi
done

echo "KNOWN (${#known[@]}):"
printf '  %s\n' "${known[@]}"
echo
echo "UNKNOWN (${#unknown[@]}):"
printf '  %s\n' "${unknown[@]}"
