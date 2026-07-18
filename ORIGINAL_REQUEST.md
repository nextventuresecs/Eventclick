# Original User Request

## Initial Request — 2026-07-16T13:58:28Z

# Teamwork Project Prompt — Draft

The goal is to create a comprehensive end-to-end testing strategy document for the Eventclick application, which is currently deployed on AWS and Cloudflare. The strategy should cover UI, API, performance, and security testing. We are starting from scratch for E2E testing.

Working directory: `packages/shared/docs/testing`
Integrity mode: demo

## Requirements

### R1. Comprehensive Test Plan Document
Create a detailed, markdown-formatted testing strategy document (`e2e-testing-strategy.md`) that outlines the approach, tools, test data management, and CI/CD integration for UI, API, performance, and security testing.

### R2. Test Case Outlines
Provide high-level outlines for at least 5 critical user journeys (e.g., event creation, attendee registration, photo upload) including setup steps, expected outcomes, and edge cases to test.

### R3. Responsibility Matrix
Include a matrix of testing responsibilities defining who writes, runs, and maintains different types of tests across the development lifecycle.

### R4. Security Testing Tools
Suggest specific security testing tools (e.g., OWASP ZAP, Burp Suite) and how they fit into the overall strategy.

## Acceptance Criteria

### Verification Approach
*This project will be verified using an Agent-as-judge approach against a specific rubric.*

### Document Completeness
- [ ] The document must explicitly define recommended tools for UI (e.g., Playwright), API, Performance, and Security testing.
- [ ] The document must define a strategy for managing test data in staging and production (AWS/Cloudflare) environments without polluting real data.
- [ ] The document must include a CI/CD integration plan for running these tests automatically.
- [ ] The document must contain a clear matrix mapping testing phases/types to the roles responsible for them.

### Test Case Quality
- [ ] At least 5 critical user journeys must be outlined.
- [ ] Each journey must include a clear "setup" step and verifiable "expected outcome".
