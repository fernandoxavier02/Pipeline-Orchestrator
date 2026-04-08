import os
import json

# ── Gemini Pipeline Dashboard ──────────────────────────────────────────────────

SPECS_DIR = ".kiro/specs"
SESSION_DIR = ".gemini/session"
ACTIVE_SPEC_FILE = os.path.join(SESSION_DIR, "active_spec.txt")
TDD_STATE_FILE = os.path.join(SESSION_DIR, "tdd_state.json")

def get_active_spec():
    if os.path.exists(ACTIVE_SPEC_FILE):
        with open(ACTIVE_SPEC_FILE, 'r') as f:
            return f.read().strip()
    return None

def calculate_score(spec_name):
    score = 0
    details = []
    
    spec_path = os.path.join(SPECS_DIR, spec_name, "spec.json")
    if os.path.exists(spec_path):
        with open(spec_path, 'r') as f:
            data = json.load(f)
            approvals = data.get("approvals", {})
            if approvals.get("requirements"): 
                score += 15
                details.append("Phase 1: Format Gate [PASS] (+15%)")
            if approvals.get("design"):
                score += 20
                details.append("Phase 2: Content Review [GO] (+20%)")
            if data.get("phase") == "completed":
                score += 25
                details.append("Phase 3: Implementation [DONE] (+25%)")

    if os.path.exists(TDD_STATE_FILE):
        with open(TDD_STATE_FILE, 'r') as f:
            tdd = json.load(f)
            if tdd.get("passed"):
                score += 20
                details.append("Phase 4: Post-Impl Validation [PASS] (+20%)")

    return score, details

def main():
    active_spec = get_active_spec()
    print("+======================================================================+")
    print(f"|  GEMINI PIPELINE DASHBOARD: {active_spec or 'N/A'}")
    print("+======================================================================+")
    
    if not active_spec:
        print("|  Nenhuma spec ativa. Use 'echo name > .gemini/session/active_spec.txt'")
    else:
        score, details = calculate_score(active_spec)
        grade = "NOT READY"
        if score >= 90: grade = "PRODUCTION READY"
        elif score >= 75: grade = "DEPLOY WITH MONITORING"
        elif score >= 50: grade = "REMEDIATION NEEDED"

        print(f"|  CONFIDENCE: [{'#' * (score // 5)}{'.' * (20 - score // 5)}] {score}%  {grade}")
        print("+----------------------------------------------------------------------+")
        for detail in details:
            print(f"|  {detail}")
    
    print("+======================================================================+")

if __name__ == "__main__":
    main()
