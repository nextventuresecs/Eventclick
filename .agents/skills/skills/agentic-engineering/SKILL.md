# Agentic Engineering Skill
## Universal Principles for Working with AI Agents (Claude, Gemini, and Beyond)

---

## Overview

This skill embodies proven principles and workflows for effective agentic engineering with any AI agent - Claude, Gemini, or other coding assistants. It transforms how you work with AI from writing code line-by-line to orchestrating outcomes at the task level.

**Core Philosophy**: You're not coding anymore. You're defining outcomes, setting constraints, reviewing results, and multiplying your output through intelligent delegation and parallelism.

**Applicable to**: Claude (Opus, Sonnet, Haiku), Gemini (Pro, Flash, Deep Think), and any agentic coding assistant.

---

## When to Use This Skill

Use this skill when:
- Working on any software development task with AI agents
- Managing complex, multi-step implementations
- Debugging production issues or failing CI/CD pipelines
- Architecting new features or systems
- Learning new codebases or technologies
- Performing code reviews or refactoring
- Handling data analysis or database work

This skill applies to ALL development work, not just specific scenarios, and works with ANY AI coding agent.

---

## Core Principles (The Non-Negotiables)

### 1. Plan Before Build
**Rule**: Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).

```
Never jump straight to implementation for complex tasks.
Pour your energy into the plan so your AI agent can 1-shot the implementation.
```

**When to plan**:
- Complex features requiring multiple files
- Architectural decisions
- Major refactors
- When something goes sideways (STOP and re-plan immediately)
- Verification steps (not just for building)

**How to prompt**:
```
"Enter plan mode. I need to [describe goal].

Context:
- Current state: [brief description]
- Constraints: [any limitations]
- Success criteria: [what done looks like]

Create a detailed plan with:
1. File structure changes needed
2. Implementation steps
3. Testing strategy
4. Verification criteria"
```

**Advanced technique**: Use two separate Claude sessions:
- Session 1: Write the plan
- Session 2: Review it as a staff engineer
- Iterate until both agree

### 2. Stop When Things Go Sideways
**Rule**: The moment something goes wrong, switch back to plan mode and re-plan. Don't keep pushing.

```
If the implementation isn't going as expected:
1. STOP immediately
2. Re-enter plan mode
3. Re-plan with new information
4. Start fresh with better approach
```

### 3. Autonomous by Default
**Rule**: Let your AI agent handle the details. Use the "just fix it" approach.

```
Bad: "Check the logs, then look at line 45, then..."
Good: "Go fix the failing CI tests. Don't ask for hand-holding."

Bad: "First import this, then create a function..."
Good: "Implement user authentication with JWT. Make it production-ready."
```

**Examples of autonomous prompts**:
- "Here's the Slack bug thread: [paste]. Fix it."
- "CI is failing on feature-auth branch. Fix the tests."
- "Point yourself at docker logs and troubleshoot the payment service."
- "Fetch this API spec from Drive and implement the endpoints."

### 4. Verify Before Done
**Rule**: NEVER mark a task complete without proving it works.

**Verification checklist**:
1. Diff behavior between main and feature branch
2. Run all tests (unit, integration, e2e)
3. Check logs for errors or warnings
4. Ask: "Would a staff engineer approve this?"
5. Demonstrate correctness with concrete evidence

**Prompts that enforce verification**:
```
"Grill me on these changes and don't make a PR until I pass your test."

"Prove to me this works by:
1. Running the test suite
2. Showing before/after behavior
3. Explaining edge cases you've covered"

"Use plan mode for verification steps - don't just build, verify."
```

### 5. Demand Elegance (When It Matters)
**Rule**: For complex problems where architecture matters, challenge yourself and Claude.

```
"Knowing everything you know now, scrap this and implement the elegant solution."
```

**When to use**:
- Complex architectural problems
- Code with duplication or unclear abstractions
- Solutions that feel hacky or brittle
- Before presenting work that will be reviewed

**When to skip**:
- Simple, obvious fixes
- Time-sensitive hotfixes
- Well-understood patterns

**Red flags that trigger elegance review**:
- Code duplication
- Hacky workarounds
- Unclear abstractions
- Brittle solutions

### 6. Continuous Self-Improvement
**Rule**: After EVERY correction from you, have your AI agent update its rules/documentation.

```
"Update your [RULES.md / AGENT.md / project documentation] so you 
don't make that mistake again."
```

AI agents are remarkably good at writing rules for themselves.

**Create a memory structure**:
```
project-root/
└── .ai-agent/
    ├── RULES.md              # Main behavioral rules
    ├── lessons.md            # Patterns learned over time
    ├── mistakes-to-avoid.md  # Common errors to prevent
    └── project-notes/        # Per-feature context
        ├── auth-feature.md
        ├── payments-feature.md
        └── refactor-notes.md
```

**Update pattern for lessons.md**:
```markdown
## Date: [YYYY-MM-DD]
### Pattern: [Brief title]
**Mistake**: [What went wrong]
**Correction**: [What should happen instead]
**Rule**: [Specific guideline to follow]
```

**Ruthlessly edit** these files over time. Keep iterating until your agent's mistake rate measurably drops.

### 7. Parallel Everything
**Rule**: Run 3-5 parallel AI agent sessions whenever possible. This is the #1 productivity unlock.

**Why parallel work matters**:
- Zero context switching between tasks
- Different tasks progress simultaneously
- Keeps context windows focused and clean
- 3-5x productivity multiplier

**How to set up**:
```bash
# Using git worktrees (recommended)
git worktree add ../worktree-main main
git worktree add ../worktree-feature-a feature-a
git worktree add ../worktree-feature-b feature-b
git worktree add ../worktree-bugfix bugfix-branch
git worktree add ../worktree-analysis main

# Shell aliases for quick navigation
alias za='cd ~/projects/worktree-main'
alias zb='cd ~/projects/worktree-feature-a'
alias zc='cd ~/projects/worktree-feature-b'
alias zd='cd ~/projects/worktree-bugfix'
alias ze='cd ~/projects/worktree-analysis'
```

**Typical parallel setup**:
- Agent 1: Main feature development
- Agent 2: Bug fixing in parallel
- Agent 3: Test writing
- Agent 4: Code analysis/refactoring
- Agent 5: Documentation or logs analysis

### 8. Use Subagents Liberally
**Rule**: Delegate individual tasks to subagents to keep your main context window clean and focused.

**When to use subagents**:
- Research and exploration tasks
- Parallel analysis of multiple components
- Offloading non-critical work
- When you want to throw more compute at a problem

**How to prompt**:
```
"Use subagents to analyze these 5 API endpoints in parallel."
"Delegate the database migration to a subagent while you work on the API."
"Have a subagent research authentication libraries and report back."
"Use subagents" (appended to any request for more compute)
```

### 9. Reduce Ambiguity Upfront
**Rule**: Write detailed specs and reduce ambiguity before handing off work. The more specific you are, the better the output.

```
Bad: "Add user authentication"

Good: "Add user authentication with these requirements:
- JWT-based tokens with 24hr expiry
- Refresh token rotation
- Email/password login
- OAuth2 support for Google and GitHub
- Rate limiting: 5 attempts per 15 minutes
- Tests: unit tests for token generation, integration tests for full auth flow
- Security: bcrypt for passwords, secure httpOnly cookies
- Error handling: clear messages for invalid credentials, expired tokens"
```

### 10. Challenge Your Agent
**Rule**: Make your AI agent prove its work and act as your reviewer.

**Prompts that create accountability**:
```
"Grill me on these changes and don't make a PR until I pass your test."

"Prove to me this works by diffing behavior between main and your branch."

"Review this code as a senior engineer. Be critical. What would you change?"

"Act as a staff engineer reviewing this PR. Challenge assumptions."
```

### 11. Leverage Global Skills
**Rule**: Read relevant skill documentation BEFORE starting work on specialized tasks.

**Available skills provide**:
- Battle-tested best practices
- Common pitfalls to avoid
- Production-ready patterns
- Quality standards

**When to use skills**:
```
Creating documents → Read docx skill first
Building UI → Read frontend-design skill first
Working with data → Read xlsx skill first
Making presentations → Read pptx skill first
PDF processing → Read pdf skill first
Claude API work → Read product-self-knowledge skill first
```

**Why this matters**:
- Skills contain condensed wisdom from extensive trial and error
- Reading the skill first dramatically improves output quality
- Reduces iterations and rework
- Ensures production-ready results

**The workflow**:
```
1. Identify the task type
2. Read relevant skill(s) FIRST
3. Follow skill guidance during implementation
4. Reference skill for verification
5. Update skill with learnings if patterns improve
```

**Example**:
```
User: "Create a technical specification document"
Agent: [Immediately reads docx SKILL.md before starting]
Agent: [Follows docx skill patterns]
Agent: [Produces professional, well-formatted document]

vs.

User: "Create a technical specification document"  
Agent: [Starts writing without reading skill]
Agent: [Produces adequate but not optimal document]
Agent: [Requires multiple revisions]
```

---

## Integration with Global Skills

For production-ready results, leverage specialized global skills when working on specific tasks. These skills contain battle-tested best practices and patterns.

### Document Creation and Manipulation

#### Word Documents (.docx)
**When to use**: Creating reports, memos, professional documents, templates, or any task involving .docx files.

**Skill**: `docx`

**Triggers**:
- User wants to create Word documents
- Need to read/edit/manipulate .docx files
- Producing professional documents with formatting (tables of contents, headings, page numbers)
- Working with letterheads or templates
- Extracting or reorganizing content from Word documents
- Inserting/replacing images in documents
- Find-and-replace operations in Word files

**Integration with agentic workflow**:
```
"I need to create a technical specification document for this feature.
Use the docx skill to create a professional Word document with:
- Table of contents
- Proper heading hierarchy
- Code snippets in formatted blocks
- Architecture diagrams
- Section numbering"
```

#### PDF Files
**When to use**: Any PDF-related task - reading, creating, manipulating, or filling forms.

**Skill**: `pdf`

**Triggers**:
- Reading or extracting text/tables from PDFs
- Combining or merging multiple PDFs
- Splitting PDFs apart
- Rotating pages, adding watermarks
- Creating new PDFs
- Filling PDF forms
- Encrypting/decrypting PDFs
- Extracting images from PDFs
- OCR on scanned PDFs

**Integration with agentic workflow**:
```
"Extract the API specifications from these three PDF documents,
merge the information, and create a consolidated implementation guide.
Use the pdf skill for reading and the docx skill for the output."
```

#### Presentations (.pptx)
**When to use**: Creating slide decks, pitch decks, or any presentation-related task.

**Skill**: `pptx`

**Triggers**:
- Creating slide decks or presentations
- Reading/parsing/extracting from .pptx files
- Editing or modifying existing presentations
- Combining or splitting slide files
- Working with templates, layouts, speaker notes
- Any task where a .pptx file is input or output

**Integration with agentic workflow**:
```
"Create a technical presentation explaining this new architecture.
Use the pptx skill to create a slide deck with:
- Executive summary
- Architecture diagrams
- Implementation timeline
- Risk assessment
- Q&A talking points"
```

#### Spreadsheets (.xlsx, .csv)
**When to use**: Working with tabular data, creating reports, data analysis, or spreadsheet manipulation.

**Skill**: `xlsx`

**Triggers**:
- Opening, reading, editing .xlsx, .xlsm, .csv, .tsv files
- Creating new spreadsheets from scratch or other data
- Adding columns, computing formulas, formatting
- Charting and visualization
- Cleaning messy data
- Converting between tabular file formats
- Restructuring data (malformed rows, misplaced headers)

**Integration with agentic workflow**:
```
"Analyze this application's user metrics and create a monthly report.
Use the xlsx skill to:
1. Import data from multiple CSV files
2. Create pivot tables for analysis
3. Generate charts showing trends
4. Format as professional spreadsheet
5. Add formulas for key metrics"
```

### Development and Design

#### Frontend Design
**When to use**: Creating user interfaces, web components, or any visual web design.

**Skill**: `frontend-design`

**Triggers**:
- Building web components, pages, or applications
- Creating websites, landing pages, dashboards
- Developing React components
- Designing HTML/CSS layouts
- Styling or beautifying any web UI
- Need for distinctive, production-grade frontend interfaces

**Integration with agentic workflow**:
```
"Implement the user dashboard for this application.
Use the frontend-design skill to create a production-grade interface with:
- Modern, distinctive design (avoid generic AI aesthetics)
- Responsive layout
- Proper component architecture
- Accessibility features
- Clean, maintainable code"
```

**Key principle from frontend-design**: Generate creative, polished code and UI design that avoids generic AI aesthetics.

### Product and Company Knowledge

#### Anthropic Product Information
**When to use**: Whenever discussing or working with Anthropic products (Claude API, Claude Code, Claude.ai).

**Skill**: `product-self-knowledge`

**Triggers**:
- Questions about Claude Code (installation, requirements, MCP integration)
- Claude API usage (function calling, batch processing, SDK, rate limits, pricing)
- Claude.ai features (Pro vs Team vs Enterprise, limits)
- Comparing LLM providers
- Any specific facts about Anthropic's products

**Integration with agentic workflow**:
```
"Before implementing this Claude API integration, verify the current
best practices and rate limits. Use the product-self-knowledge skill
to ensure we're using the latest API features correctly."
```

**Important**: Training data may be outdated - always verify with this skill.

### Advanced Creation Skills

#### Canvas Design (Visual Art)
**When to use**: Creating posters, visual art, static designs.

**Skill**: `canvas-design` (example skill)

**Triggers**:
- User asks for poster, piece of art, design, or static visual
- Need for beautiful visual art in .png or .pdf
- Design work using design philosophy principles

**Integration with agentic workflow**:
```
"Create a conference poster for our technical talk.
Use the canvas-design skill to create original visual art that:
- Captures the key concepts visually
- Uses professional design principles
- Avoids copying existing artists' work
- Outputs in high-quality PDF"
```

#### Brand Guidelines (Anthropic Brand)
**When to use**: When creating artifacts that should use Anthropic's look-and-feel.

**Skill**: `brand-guidelines` (example skill)

**Triggers**:
- Need for Anthropic's official brand colors
- Typography requirements
- Visual formatting with company design standards
- Any artifact benefiting from Anthropic branding

**Integration with agentic workflow**:
```
"Create internal documentation for this feature.
Use the brand-guidelines skill to apply Anthropic's visual identity."
```

---

## Task-to-Skill Mapping

Use this quick reference to know which skills to invoke for common tasks:

| Task | Primary Skill | Secondary Skills | Workflow |
|------|--------------|------------------|----------|
| **Technical documentation** | `docx` | - | Create professional Word doc with TOC, formatting |
| **API documentation** | `docx` | `pdf` | Extract from PDFs, create formatted doc |
| **Data analysis report** | `xlsx` | `docx`, `pptx` | Analyze in Excel, present in Word/PowerPoint |
| **Frontend feature** | `frontend-design` | - | Use design principles, avoid generic aesthetics |
| **Technical presentation** | `pptx` | `canvas-design` | Create slides with visual diagrams |
| **Visual design** | `canvas-design` | `frontend-design` | Create original art, use design philosophy |
| **PDF processing** | `pdf` | `docx` | Extract, merge, convert PDFs |
| **Data transformation** | `xlsx` | - | Clean, restructure, analyze tabular data |
| **Claude API integration** | `product-self-knowledge` | - | Verify current API features and best practices |
| **Company-branded content** | `brand-guidelines` | `docx`, `pptx` | Apply Anthropic's visual identity |

---

## Skill-Enhanced Workflows

### Enhanced Planning Workflow

When planning complex features, reference relevant skills in your plan:

```
"Enter plan mode. I need to build a user analytics dashboard.

Context:
- Web application with React frontend
- Data from PostgreSQL database
- Need to present monthly reports to stakeholders

Create a plan that:
1. Uses frontend-design skill for the dashboard UI
2. Uses xlsx skill for data analysis and report generation
3. Uses pptx skill for executive presentation
4. Uses docx skill for technical documentation

For each component, specify:
- Which skill provides guidance
- Key principles from that skill
- Integration points between components"
```

### Enhanced Implementation Workflow

```
Step 1: Architecture & Planning (Gemini Deep Think or Claude Opus)
"Design the analytics dashboard system. Reference frontend-design skill
for UI patterns and xlsx skill for data handling approaches."

Step 2: Frontend Implementation (Claude Sonnet + frontend-design skill)
"Implement the dashboard UI. Use frontend-design skill to ensure:
- Production-grade, distinctive design
- Avoid generic AI aesthetics
- Proper component architecture"

Step 3: Data Layer Implementation (Gemini Pro + xlsx skill)
"Implement data processing. Use xlsx skill patterns for:
- Efficient data transformation
- Report generation
- Chart creation"

Step 4: Documentation (Claude Sonnet + docx skill)
"Create technical documentation. Use docx skill to produce:
- Professional formatting
- Table of contents
- Code snippets
- Architecture diagrams"

Step 5: Presentation (Claude Sonnet + pptx skill)
"Create executive presentation. Use pptx skill for:
- Clear slide structure
- Data visualization
- Key metrics highlighted"
```

### Enhanced Review Workflow

Before finalizing work, ensure skill guidance was followed:

```
"Review this implementation. Verify that:
1. Frontend follows frontend-design skill principles (no generic aesthetics)
2. Documents meet docx skill standards (professional formatting)
3. Data handling uses xlsx skill best practices
4. If Anthropic-branded, brand-guidelines skill was applied
5. All relevant skill patterns were implemented"
```

---

## Creating Project-Specific Skills

While global skills provide general guidance, create project-specific skills for your codebase:

### Combining Global and Project Skills

```
project-root/
├── .ai-agent/
│   ├── RULES.md                    # Project-specific rules
│   ├── skills/
│   │   ├── project-frontend.md     # Extends frontend-design
│   │   ├── project-docs.md         # Extends docx
│   │   └── project-data.md         # Extends xlsx
│   └── global-skills-reference.md  # Links to global skills
```

**Example project-specific skill that extends global skill**:

```markdown
# project-frontend.md

**Extends**: frontend-design global skill

**Project-Specific Additions**:
- Use company design system (colors: #1a1a1a, #ffffff, #0066cc)
- All components must support dark mode
- Follow accessibility WCAG 2.1 AA standards
- Use project's component library (src/components/ui)

**Process**:
1. First, review frontend-design skill for general principles
2. Apply project-specific design system
3. Ensure component library usage
4. Verify dark mode support
5. Run accessibility checks
```

---

## Skill Invocation Patterns

### Explicit Skill Reference

```
"Use the [skill-name] skill to [task description]."

Examples:
- "Use the docx skill to create this report"
- "Use the frontend-design skill to build this dashboard"
- "Use the xlsx skill to analyze this data"
```

### Implicit Skill Triggering

The agent should automatically invoke skills when task descriptions match triggers:

```
"Create a Word document with the API specification"
→ Agent recognizes docx skill trigger, reads skill before proceeding

"Build a user dashboard with a modern, distinctive design"
→ Agent recognizes frontend-design skill trigger, applies principles

"Process these CSV files and create a monthly report"
→ Agent recognizes xlsx skill trigger, follows patterns
```

### Multi-Skill Coordination

```
"Create a comprehensive project proposal with:
- Technical specification (docx skill)
- Data analysis (xlsx skill)
- Visual mockups (canvas-design skill)
- Executive presentation (pptx skill)

Coordinate between skills to ensure:
- Consistent terminology across all documents
- Shared color scheme and branding
- Cross-references between documents
- Professional, cohesive deliverable package"
```

---

## Best Practices for Skill Usage

### 1. Read Skills Before Implementation

**Critical Rule**: When a task implicates a skill, ALWAYS read the skill documentation FIRST before writing any code or creating any files.

```
Bad workflow:
User: "Create a Word document with the project spec"
Agent: [immediately starts creating document]

Good workflow:
User: "Create a Word document with the project spec"
Agent: [calls view tool on docx SKILL.md]
Agent: [reads and understands best practices]
Agent: [implements following skill guidelines]
```

### 2. Combine Skills for Complex Tasks

Many tasks require multiple skills working together:

```
"Create a quarterly business review package:
1. Data analysis (xlsx skill)
2. Executive summary document (docx skill)
3. Presentation slides (pptx skill)
4. Visual summary poster (canvas-design skill)

Ensure all components:
- Use consistent data and metrics
- Have unified visual style
- Cross-reference each other
- Form a cohesive package"
```

### 3. Update Skills Based on Learnings

When you discover better patterns while using a skill:

```
"This approach worked better than the skill suggested.
Update the project-specific skill extension with this improvement."
```

### 4. Create Skill Combinations

Document common skill combinations for your projects:

```markdown
# .ai-agent/skill-combinations.md

## "Full Feature Package"
Used for: New feature releases

Includes:
1. frontend-design: Build the UI
2. docx: Create technical documentation
3. pptx: Create launch presentation
4. xlsx: Prepare metrics tracking template

Process:
[detailed workflow combining all skills]
```

---

## Skill Discovery and Maintenance

### Discovering Available Skills

When starting a new task, check available skills:

```
"What skills are available for [task type]?
Show me which skills would be most relevant for [specific task]."
```

### Keeping Skills Updated

Regularly review and update skill references:

```
Weekly:
- Review which skills were used
- Note any gaps in skill coverage
- Document successful skill combinations

Monthly:
- Update project-specific skill extensions
- Review global skill updates
- Archive obsolete skill patterns
```

### Contributing to Skill Ecosystem

When you develop effective patterns:

```
1. Document the pattern
2. Determine if it's project-specific or generalizable
3. If general: Propose addition to global skill
4. If specific: Add to project skill extensions
5. Share with team via git
```

---

### Workflow 1: Complex Task Pattern

```
Step 1: PLAN MODE
"Enter plan mode. [Describe goal with context and constraints]"
→ Generate comprehensive implementation plan

Step 2: PEER REVIEW (Optional for critical features)
[Open second agent session]
"Review this plan as a staff engineer. Challenge assumptions."
→ Iterate until both agent sessions agree

Step 3: IMPLEMENTATION
"Implement based on this plan. If anything goes sideways, stop and re-plan."
→ Agent executes the plan

Step 4: VERIFICATION
"Prove this works: run tests, diff main vs branch, check logs."
→ Agent demonstrates correctness

Step 5: ELEGANCE CHECK (For complex solutions)
"Is there a more elegant way to implement this?"
→ Review for better architecture if needed

Step 6: SELF-IMPROVEMENT
"Update your RULES.md based on what you learned."
→ Agent documents lessons
```

### Workflow 2: Autonomous Bug Fix

```
Scenario: Failing CI, bug report, or production issue

Prompt:
"[Provide context: Slack thread, error logs, or issue description]
Fix it autonomously. Use the terminal for debugging as needed."

Your agent will:
1. Investigate (code, logs, stack traces)
2. Identify root cause
3. Implement the fix
4. Create regression tests
5. Verify bug is resolved
6. Report with evidence

Examples:
- "The CI is failing on the feature-auth branch. Go fix the failing tests."
- "Here's the Slack bug thread: [paste]. Fix it."
- "Point yourself at docker logs for the payment service and troubleshoot."
```

### Workflow 3: Learning New Codebase

```
Step 1: ANALYSIS
"Enable explanatory output style. Analyze this codebase and create:
1. High-level architecture overview
2. Key components and relationships
3. Data flow diagrams
4. External dependencies
5. Entry points and main workflows"

Step 2: VISUAL LEARNING
"Generate an HTML presentation explaining how this system works.
Include flow diagrams, code snippets, and explanations."

Step 3: INTERACTIVE Q&A
"Act as a mentor for this codebase. I'll ask questions.
Explain with code examples, diagrams, and links to relevant files."

Step 4: HANDS-ON
"Walk me through adding a small feature. Teach me the patterns."
```

### Workflow 4: Tech Debt Cleanup

```
Create a /techdebt workflow:

"Scan the codebase for:
1. Duplicated code
2. Unused imports and dead code
3. Opportunities for abstraction
4. Inconsistent patterns

For each finding:
- Explain the issue
- Propose a refactoring plan
- Estimate risk and effort
- Prioritize by impact

Then implement the top 3 improvements."

Run this at the end of every sprint or session.
```

### Workflow 5: End-of-Session Review

```
"Review today's work and update:
1. lessons.md with patterns learned
2. RULES.md with new guidelines
3. project-notes/[feature].md with progress

Generate a summary of:
- What was accomplished
- What needs attention tomorrow
- Any blockers or concerns"
```

---

## Advanced Techniques

### 1. Voice Dictation for Better Prompts

**Key insight**: You speak 3x faster than you type → more detailed prompts → better results.

**How to use**:
- macOS: Press `fn` key twice
- Windows: Windows + H
- Speak naturally and in detail
- Edit for clarity if needed

**Example**:
```
Instead of typing: "Add auth"

Speak (same time, 10x more detail):
"Add user authentication to the application using JWT tokens with 
24-hour expiry. Store refresh tokens in the database with 30-day 
expiry. Implement login and signup endpoints. Add middleware to 
protect routes. Hash passwords with bcrypt using 12 rounds. Return 
tokens in httpOnly cookies. Add rate limiting of 5 attempts per 
15 minutes. Write integration tests covering happy path and errors."
```

### 2. Agent and Model Selection Strategy

**Choose the right agent for the task**. Different AI models have different strengths.

#### Claude Models

| Model | Best For | Characteristics |
|-------|----------|----------------|
| Claude Opus 4.5 | Complex reasoning, security audits, code review | Highest capability, best analytical reasoning |
| Claude Sonnet 4.5 | Production code, balanced tasks, documentation | Best balance of speed and quality |
| Claude Haiku 4.5 | Quick fixes, simple tasks, rapid iteration | Fastest, cost-effective for simple work |

#### Gemini Models

| Model | Best For | Characteristics |
|-------|----------|----------------|
| Gemini 3 Deep Think | Architecture, complex algorithms, system design | Extended reasoning, excels at deep analysis |
| Gemini 3 Pro | Production code, data analysis, BigQuery | Balanced performance, native GCP integration |
| Gemini 3 Flash | Rapid prototyping, quick iterations, MVPs | Fastest, great for exploration |

#### Task-Based Selection Matrix

| Task Type | Primary Choice | Alternative | Why |
|-----------|---------------|-------------|-----|
| **Complex architecture** | Gemini 3 Deep Think | Claude Opus 4.5 | Extended reasoning, system design |
| **Production code** | Claude Sonnet 4.5 | Gemini 3 Pro | High quality, balanced performance |
| **Rapid prototyping** | Gemini 3 Flash | Claude Haiku 4.5 | Speed matters most |
| **Code review** | Claude Opus 4.5 | Gemini 3 Deep Think | Analytical reasoning, security focus |
| **Quick fixes** | Claude Haiku 4.5 | Gemini 3 Flash | Fast iteration needed |
| **Documentation** | Claude Sonnet 4.5 | Gemini 3 Pro | Natural language generation |
| **Security audit** | Claude Opus 4.5 | Gemini 3 Deep Think | Security-focused analysis |
| **Data/SQL/BigQuery** | Gemini 3 Pro | Claude Sonnet 4.5 | Native BigQuery, data tools |
| **Debugging** | Claude Sonnet 4.5 | Gemini 3 Pro | Strong at tracing issues |
| **Testing** | Gemini 3 Flash | Claude Haiku 4.5 | Fast test generation |

#### Platform-Specific Considerations

Different platforms provide different capabilities:

**Claude Code** (CLI tool):
- Native terminal integration
- Subagent support
- MCP server integration
- Git worktree support built-in
- Best for: Full development workflows

**Google Antigravity**:
- Multiple agent modes (Agent-Assisted, Agent-Driven, Review-Driven)
- Built-in terminal policy management
- Ghostty terminal integration
- Status line for context monitoring
- Best for: Flexible agent autonomy levels

**Claude.ai / Gemini Chat**:
- Web-based interface
- Good for planning and review
- Limited terminal access
- Best for: Architecture, planning, code review

**API Integration** (via Anthropic or Google APIs):
- Full programmatic control
- Can build custom workflows
- Integrate into existing tools
- Best for: Custom tooling, automation

**IDE Plugins** (Cursor, Continue, etc.):
- Direct code editing
- In-editor suggestions
- Best for: Inline development

**Choose your platform based on**:
- Level of autonomy needed
- Terminal access requirements
- Integration with existing tools
- Team collaboration needs

#### Deep Reasoning Activation

**For complex architectural tasks**, enable deep reasoning/extended thinking mode:

**Gemini**:
- Select Gemini 3 Pro
- Toggle "Deep Think" mode
- Takes longer but produces higher quality

**Claude**:
- Use Opus 4.5 for inherent deep reasoning
- Or request extended thinking explicitly

**When to use Deep Reasoning**:
- System architecture decisions
- Complex algorithm implementations  
- Security-critical code
- Performance optimization strategies
- Novel problem solving

**Example prompt**:
```
"Enable deep thinking mode. Design a scalable real-time messaging 
system handling 1M concurrent connections. Consider:
- WebSocket vs Server-Sent Events
- Horizontal scaling strategy
- Message persistence
- Presence management
- Rate limiting"
```

#### Multi-Agent Pipeline Strategy

**Use different agents for different parts of the same project:**

```
Example: Feature Development Pipeline

Step 1: Architecture (Gemini 3 Deep Think or Claude Opus 4.5)
"Design the overall system for user notifications"
→ Comprehensive architecture plan

Step 2: Implementation (Claude Sonnet 4.5 or Gemini 3 Pro)  
"Implement the notification service based on this plan"
→ Fast, high-quality code generation

Step 3: Security Review (Claude Opus 4.5)
"Review this implementation for security issues and vulnerabilities"
→ Thorough security analysis

Step 4: Tests (Gemini 3 Flash or Claude Haiku 4.5)
"Generate comprehensive unit and integration tests"
→ Quick test generation

Step 5: Documentation (Claude Sonnet 4.5)
"Write comprehensive documentation for this notification service"
→ Clear, well-structured docs

Step 6: Performance Analysis (Gemini 3 Deep Think)
"Analyze this for performance bottlenecks and optimization opportunities"
→ Deep performance insights
```

#### Agent Switching Mid-Task

Don't hesitate to switch agents when:
- You need deeper analysis (switch to Opus/Deep Think)
- You need faster iteration (switch to Flash/Haiku)
- Task complexity changes
- Different expertise is needed

**Example**:
```
Start with Gemini 3 Pro: "Implement this feature"
[Implementation reveals complexity]
Switch to Gemini 3 Deep Think: "Redesign this architecture more elegantly"
[Get new design]
Switch back to Gemini 3 Pro: "Implement based on this better design"
```

#### Cross-Agent Collaboration

**Use multiple agents simultaneously for peer review**:

```
Terminal 1 (Gemini 3 Pro):
"Implement user authentication system"

Terminal 2 (Claude Opus 4.5):
"Review this authentication implementation for security issues"

Terminal 3 (Claude Sonnet 4.5):
"Write integration tests for this authentication system"
```

This gives you:
- Implementation from one agent
- Security review from another
- Test coverage from a third
- Different "perspectives" on the same problem

### 3. Create Reusable Skills

**Rule**: If you do something more than once a day, turn it into a skill or workflow.

**Skills to create**:

**Tech Debt Hunter**:
```markdown
# /techdebt

Purpose: Find and eliminate code duplication

Steps:
1. Scan for duplicate functions/components
2. Identify abstraction opportunities
3. Propose refactoring plan
4. Implement consolidation
5. Update tests
6. Verify no regressions
```

**Context Sync**:
```markdown
# /sync

Purpose: Pull recent context from multiple sources

Sources:
- Last 7 days of Slack messages
- Recent GitHub PRs and issues
- Google Drive docs
- Task tracker updates

Output: Single context dump file
Use before starting major features
```

**Analytics Workflow**:
```markdown
# /analyze

Purpose: Data analysis and querying

Capabilities:
- Generate SQL queries from natural language
- Execute via database CLI
- Validate data
- Generate tests
- Create visualizations
```

### 4. Autonomous Test Loops

Enable your AI agent to fix tests automatically:

```
"Enable autonomous test loop. Run the test suite.
If any tests fail:
1. Analyze the error
2. Examine relevant code
3. Fix the issue
4. Re-run tests
5. Repeat until all tests pass
Report when complete."
```

### 5. Integration with External Systems

Connect your AI agents to workflow tools:

**Bug tracking**:
```
"Fetch the bug thread from [Slack/Jira/GitHub] and fix it autonomously."
```

**Documentation**:
```
"Read the API spec from [Google Drive/Confluence/Notion] and implement the endpoints."
```

**CI/CD**:
```
"Monitor the CI pipeline. If tests fail, pull logs, identify failure, 
fix code, commit, push, and verify CI passes. Do this autonomously."
```

### 6. Learning Mode

Enable explanatory output for learning:

```
"Enable explanatory mode. For each change:
- Explain why you chose this approach
- What alternatives you considered
- What trade-offs you made
- How the code works"
```

**Generate learning materials**:
```
"Create an HTML presentation explaining [concept].
Include visual diagrams, code snippets with explanations, 
and common pitfalls."

"Draw ASCII diagrams showing:
1. Request flow through the system
2. Database relationships
3. Component architecture"
```

---

## Prompting Best Practices

### Structure for Complex Prompts

```
**Goal**: [What you want to achieve]

**Context**:
- Current state: [Where you are now]
- Constraints: [Limitations, requirements]
- Technology stack: [Relevant tools/frameworks]

**Requirements**:
1. [Specific requirement 1]
2. [Specific requirement 2]
3. [etc.]

**Success Criteria**:
- [What "done" looks like]
- [How to verify it works]

**Approach**:
[Your suggested approach, if any]

**Output Format**:
[How you want the response structured]
```

### Prompts That Get Results

**For planning**:
```
"Enter plan mode. Create a detailed plan for [goal]. Include file 
structure, implementation steps, testing strategy, and verification."
```

**For implementation**:
```
"Based on this plan, implement [feature]. If anything goes sideways, 
stop and re-plan."
```

**For review**:
```
"Review this as a [senior engineer/security expert/performance specialist]. 
Be critical. What would you change?"
```

**For fixing**:
```
"[Provide context]. Fix this autonomously. Don't micromanage how."
```

**For learning**:
```
"Explain [concept] as if teaching a team member. Use examples, 
diagrams, and clear language."
```

**For refactoring**:
```
"This works but could be better. Knowing everything you know about 
the codebase, implement the elegant solution."
```

### What NOT to Do

❌ **Don't micromanage**: "First do X, then Y, then Z..."
✅ **Instead**: "Achieve [outcome]. Use your judgment for approach."

❌ **Don't accept mediocrity**: "This is good enough."
✅ **Instead**: "Is there a more elegant way? Show me."

❌ **Don't skip verification**: "Looks good, ship it."
✅ **Instead**: "Prove this works with tests, diffs, and evidence."

❌ **Don't ignore mistakes**: Move on without learning
✅ **Instead**: "Update your rules so this doesn't happen again."

❌ **Don't work serially**: One task at a time
✅ **Instead**: Parallel sessions on multiple tasks

---

## File Organization

### Recommended Structure

```
project-root/
├── .ai-agent/                # Or .claude/, .gemini/, etc.
│   ├── RULES.md              # Main behavioral rules
│   ├── lessons.md            # Patterns learned
│   ├── mistakes-to-avoid.md  # Common errors
│   ├── skills/               # Reusable workflows
│   │   ├── techdebt.md
│   │   ├── sync.md
│   │   └── analyze.md
│   └── project-notes/        # Feature-specific context
│       ├── auth-feature.md
│       └── payments-feature.md
├── tasks/
│   ├── todo.md               # Current tasks
│   └── completed.md          # Archived tasks
└── [your code]
```

**Note**: You can use `.ai-agent/`, `.claude/`, `.gemini/`, or any consistent naming. The structure matters more than the name.

### Task Tracking Template

```markdown
# tasks/todo.md

## Plan First
- [ ] [Task with detailed requirements]
- [ ] [Task with success criteria]

## Verify Plans
- [ ] [Review task against requirements]

## Track Progress
- [x] [Completed task]
- [ ] [In progress task]

## Explain Changes
[High-level summary at each step]

## Document Results
[Review section after completion]

## Capture Lessons
[Update lessons.md after corrections]
```

---

## Security Best Practices

### Permission Boundaries

When AI agents need to execute commands or access resources:

**For safe operations**: Auto-approve
- Read-only commands (ls, cat, grep)
- Standard build/test commands
- Git status/diff operations

**For risky operations**: Require approval
- File deletion (rm)
- System modifications (sudo)
- Network requests to unknown hosts
- Database modifications in production

**For security-critical**: Route to human or specialized review
- Authentication/authorization code
- Payment processing
- Data encryption
- API key management

### Verification Checklist for Production Code

Before merging to production:
- [ ] All tests pass (unit, integration, e2e)
- [ ] Security review completed
- [ ] Error handling covers edge cases
- [ ] Logging is appropriate (not too verbose, not too sparse)
- [ ] Performance impact is acceptable
- [ ] Documentation is updated
- [ ] Breaking changes are documented
- [ ] Database migrations are reversible
- [ ] Configuration is externalized
- [ ] Secrets are not hardcoded

---

## Performance Optimization

### Context Window Management

**Keep context clean**:
1. Use subagents for research and exploration
2. Create separate sessions for distinct features
3. Store plans in artifacts, not in conversation
4. Archive completed work
5. Use structured memory files instead of long histories

**When context is getting full**:
```
"Summarize our current state and next steps. I'll start a fresh 
session with this summary."
```

### Parallel Work Strategies

**Efficient task distribution**:
- Session 1: Core feature implementation
- Session 2: Test writing
- Session 3: Bug fixes
- Session 4: Documentation
- Session 5: Performance optimization or log analysis

**Coordination between sessions**:
- Use git branches to isolate work
- Create integration points only when needed
- Merge frequently to avoid conflicts
- Use shared memory files for cross-session context

---

## Troubleshooting Common Issues

### Issue: Agent is asking too many questions

**Solution**: Be more specific upfront and set autonomous mode.

```
"Don't ask for permission on standard operations. If you need 
clarification on requirements, ask. Otherwise, make decisions 
and implement."
```

### Issue: Implementation doesn't match vision

**Solution**: Invest more in planning phase.

```
"Enter plan mode first. Create a detailed plan. Don't implement 
until we've agreed on the approach."
```

### Issue: Mistakes keep repeating

**Solution**: Enforce the self-improvement loop.

```
"After this correction, update your RULES.md with a specific 
guideline to prevent this mistake."
```

### Issue: Context window is getting cluttered

**Solution**: Use subagents and fresh sessions.

```
"Use a subagent to research this. Keep my main context clean."
```

or

```
"Summarize our progress. I'll start fresh with this summary."
```

### Issue: Code quality is inconsistent

**Solution**: Create project-specific rules and challenge your agent.

```
"Review this as a senior engineer. Don't approve until it meets 
production standards."
```

---

## Measuring Success

### Key Metrics

Track these over time to measure improvement:

1. **Error rate**: Mistakes that require correction
   - Goal: Decrease over time as rules improve

2. **One-shot success rate**: Tasks completed correctly first try
   - Goal: Increase as planning improves

3. **Iteration count**: Rounds of revision needed
   - Goal: Decrease as requirements become clearer

4. **Time to completion**: Hours from task start to verified completion
   - Goal: Decrease as workflows optimize

5. **Parallel efficiency**: Number of concurrent tasks in progress
   - Goal: Increase to 3-5 simultaneous sessions

### Weekly Review Questions

1. What patterns am I seeing in mistakes?
2. Which rules/skills are most valuable?
3. Where am I still micromanaging?
4. What workflows could be automated?
5. Am I using parallel sessions effectively?
6. Is my planning detailed enough?
7. Am I verifying thoroughly before shipping?

---

## Quick Reference Commands

### Essential Prompts

**Planning**:
```
"Enter plan mode. [Describe goal with full context]"
```

**Implementation**:
```
"Implement based on this plan. Stop and re-plan if issues arise."
```

**Verification**:
```
"Prove this works: run tests, diff branches, show evidence."
```

**Review**:
```
"Review this as a senior engineer. Be critical."
```

**Fix**:
```
"[Provide context]. Fix autonomously."
```

**Elegance**:
```
"Implement the elegant solution."
```

**Self-improve**:
```
"Update your rules based on this correction."
```

**Subagents**:
```
"Use subagents to [task]."
```

**Learn**:
```
"Explain this as if teaching a teammate."
```

---

## Advanced Workflows

### Multi-Stage Feature Development

```
Day 1: ARCHITECTURE
- Session 1 (Gemini Deep Think or Claude Opus): "Enter plan mode. Design [feature]."
- Session 2 (Claude Opus or Gemini Deep Think): "Review this plan as staff engineer."
- Iterate until both agree

Day 2-3: IMPLEMENTATION
- Session 1 (Claude Sonnet or Gemini Pro): "Implement backend based on plan."
- Session 2 (Claude Sonnet or Gemini Pro): "Implement frontend based on plan."
- Session 3 (Gemini Flash or Claude Haiku): "Write comprehensive tests."
All in parallel across different branches

Day 4: INTEGRATION
- Session 1 (Claude Sonnet or Gemini Pro): "Integrate frontend and backend. Test end-to-end."
- Session 2 (Gemini Flash or Claude Haiku): "Enable autonomous test loop. Fix failures."
- Session 3 (Claude Sonnet): "Generate documentation."

Day 5: REVIEW & SHIP
- Session 1 (Claude Sonnet or Gemini Pro): "Create PR with detailed description."
- Session 2 (Claude Opus): "Review PR as senior engineer. Be critical."
- Address feedback
- "Deploy to staging. Verify functionality."
```

### Autonomous CI/CD Monitoring

```
"Monitor the CI pipeline continuously. When tests fail:
1. Pull the logs
2. Identify the failure
3. Fix the code
4. Commit the fix
5. Push to branch
6. Verify CI passes
Do this autonomously until CI is green. Report issues you can't resolve."
```

### Data Analysis Workflow

```
"Connect to [database/BigQuery/data source].
Analyze [specific question or metric].
Generate optimized queries.
Present results with:
1. Key findings
2. Visualizations
3. SQL queries used
4. Recommendations

If you need to iterate, do so autonomously."
```

---

## The Meta-Skill: Orchestration

**The fundamental shift**:

You're not writing code → You're orchestrating agents

**Old way**:
- Think about implementation details
- Write code line by line
- Debug syntax errors
- Manually run tests

**New way**:
- Define desired outcomes
- Set constraints and requirements
- Review results
- Build reusable skills
- Multiply output through parallelism

**The orchestrator's checklist**:
- [ ] Is this complex enough to warrant planning?
- [ ] Can I run this in parallel with other work?
- [ ] Have I been specific enough about requirements?
- [ ] Am I letting Claude work autonomously?
- [ ] Will I verify before considering it done?
- [ ] Did I update rules after corrections?
- [ ] Could a subagent handle part of this?
- [ ] Is there a more elegant approach?

---

## Getting Started

### Week 1: Foundation
1. Create `.claude/RULES.md` in your project
2. Set up at least 2 parallel work sessions
3. Practice plan mode for complex tasks
4. Start the self-improvement loop (update rules after corrections)

### Week 2: Refinement
5. Create your first custom skill/workflow
6. Implement autonomous bug fixing
7. Use voice dictation for detailed prompts
8. Add verification steps to all tasks

### Week 3: Optimization
9. Expand to 3-5 parallel sessions
10. Create project-specific skills
11. Set up automatic test loops
12. Implement multi-session feature development

### Week 4: Mastery
13. Review and refine your rules based on patterns
14. Build cross-project skills (commit to git)
15. Implement CI/CD monitoring
16. Optimize for one-shot implementations

---

## Remember

1. **Plan first** for any complex task
2. **Stop and re-plan** when things go sideways
3. **Work autonomously** - "just fix it" mindset
4. **Verify always** - prove it works
5. **Demand elegance** for complex solutions
6. **Learn continuously** - update rules after every correction
7. **Parallelize everything** - 3-5 concurrent sessions
8. **Challenge your agent** - make it prove its work
9. **Reduce ambiguity** - detailed requirements upfront
10. **Orchestrate, don't code** - define outcomes, not implementation
11. **Use global skills** - read relevant skills BEFORE starting work
12. **Combine skills** - many tasks benefit from multiple skill guidance

---

## The Bottom Line

This isn't about learning to prompt better. It's about fundamentally changing how you build software.

- From writing code → Defining outcomes
- From debugging syntax → Reviewing results  
- From serial work → Parallel orchestration
- From doing → Delegating and verifying
- From guessing → Following proven patterns (skills)

**Master the orchestration. Leverage the skills. 10x your output.**

---

## Skills Quick Reference

### When to Read Skills FIRST

```
CRITICAL RULE: Read the skill BEFORE starting work on any of these:

📄 Word Documents → Read docx skill first
📊 Spreadsheets → Read xlsx skill first
📑 PDFs → Read pdf skill first
🎤 Presentations → Read pptx skill first
🎨 Frontend/UI → Read frontend-design skill first
🖼️ Visual Design → Read canvas-design skill first
🔧 Claude API/Product → Read product-self-knowledge skill first
🏢 Anthropic Branding → Read brand-guidelines skill first

Reading the skill first = better results, fewer iterations, production-ready output.
```

### Common Skill Combinations

```
Technical Feature Release:
├── frontend-design (build UI)
├── docx (technical docs)
├── pptx (presentation)
└── xlsx (metrics template)

Data Analysis Project:
├── xlsx (analyze data)
├── docx (write report)
├── pptx (present findings)
└── canvas-design (infographics)

API Integration:
├── product-self-knowledge (verify API details)
├── docx (integration guide)
└── frontend-design (demo UI)

Marketing Deliverable:
├── canvas-design (visual assets)
├── pptx (pitch deck)
├── docx (campaign plan)
└── brand-guidelines (company branding)
```

### Skill Invocation Syntax

```
Explicit: "Use the [skill-name] skill to..."
Example: "Use the docx skill to create this technical specification"

With Requirements: "Use [skill] to [task] with [specific requirements]"
Example: "Use the frontend-design skill to build a dashboard with modern, distinctive design"

Multi-skill: "Use [skill1] for [aspect1] and [skill2] for [aspect2]"
Example: "Use xlsx skill for analysis and pptx skill for presentation"
```

---

## Resources

- Invest time in your rules files - they compound
- Create skills for anything you do twice
- Use voice for detailed prompts
- Work in parallel always
- Challenge and verify everything

**This is the new way of building software.**
