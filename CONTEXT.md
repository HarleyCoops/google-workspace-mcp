# Repository Audit Criteria

## 1. Viability ("Can it spin up?")
- **Goal**: Verify if the project allows setting up a runtime environment.
- **Check**: Install dependencies, run tests, or start the application.
- **Proof**: Generate a screenshot if applicable.

## 2. Age / Maintenance ("Is it too old?")
- **Goal**: Identify deprecated or archived-ready projects.
- **Check**: Missing tests, unused dependencies, unsafe patterns (e.g., hardcoded secrets, SQL injection vulnerabilities).
- **Heuristic**: High volume of issues -> Archive Candidate.

## 3. Interest ("Is it interesting technology?")
- **Goal**: Determine if the tech stack is modern/valuable.
- **Check**: Analyze frameworks, libraries, and usage patterns.
- **Action**: Look for "TODO: Analyze tech stack viability" in README and address it.
