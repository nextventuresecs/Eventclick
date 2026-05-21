---
name: orchestration
description: Multi-agent coordination and task delegation skill. Use when tasks require breaking down complex work into subtasks, coordinating between Claude and Gemini, delegating specific tasks to appropriate agents, or managing multi-step workflows that benefit from specialized agent capabilities.
version: 1.0.0
category: orchestration
agent: claude
requires:
  - _core/reasoning
  - _core/debugging
dependencies:
  gemini: true
overridable: true
---

# Orchestration

This skill enables effective coordination between Claude (primary) and Gemini (secondary) agents for complex multi-step tasks.

## Orchestration Principles

### 1. Task Decomposition

Break complex requests into atomic subtasks:

```
Complex Task
├── Subtask 1 (Claude)
├── Subtask 2 (Gemini - delegated)
├── Subtask 3 (Claude)
└── Subtask 4 (Gemini - delegated)
```

**Decomposition checklist:**
- [ ] Can this task be done in parallel?
- [ ] Which parts require sequential execution?
- [ ] What are the dependencies between subtasks?
- [ ] Which agent is best suited for each subtask?

### 2. Agent Selection Strategy

**Route to Claude when task requires:**
- Complex reasoning and planning
- Code generation and debugging
- Long-form content creation
- Multi-step strategic thinking
- Detailed technical writing
- Ethical considerations

**Route to Gemini when task requires:**
- Fast text summarization
- Data extraction from documents
- Pattern classification
- Quick sentiment analysis
- Bulk content processing
- Simple categorization

**Use both agents when:**
- Task has clear reasoning + processing components
- Need validation from different perspectives
- Workload can be parallelized
- One agent generates plan, other executes

## Orchestration Workflows

### Workflow 1: Plan & Execute

**Claude's role:** Strategic planning and coordination
**Gemini's role:** Execution of specific tasks

```
1. Claude: Analyze request and create execution plan
2. Claude: Identify tasks suitable for Gemini
3. Claude: Generate clear instructions for Gemini
4. Gemini: Execute delegated tasks
5. Claude: Review Gemini's output
6. Claude: Synthesize final response
```

**Example:**
```
User: "Analyze these 50 customer reviews and create a comprehensive report"

Claude plan:
1. I'll have Gemini classify sentiment for all 50 reviews (fast processing)
2. I'll have Gemini extract key themes from each review
3. I'll synthesize Gemini's findings into strategic insights
4. I'll write the comprehensive report with recommendations
```

### Workflow 2: Iterative Refinement

For tasks requiring multiple passes:

```
1. Claude: Generate initial draft/analysis
2. Gemini: Review and flag issues/gaps
3. Claude: Refine based on Gemini's feedback
4. Repeat if necessary
```

### Workflow 3: Parallel Processing

When subtasks are independent:

```
Claude task stream:        Gemini task stream:
├── Subtask A            ├── Subtask X
├── Subtask B            ├── Subtask Y
└── Subtask C            └── Subtask Z
         └──────────┬──────────┘
              Synthesis (Claude)
```

### Workflow 4: Validation Pipeline

For high-stakes outputs:

```
1. Claude: Generate solution
2. Gemini: Validate against criteria
3. Claude: Review validation, make adjustments
4. Final output
```

## Delegation Best Practices

### Writing Clear Instructions for Gemini

When delegating to Gemini, provide:

1. **Clear objective** - What needs to be done
2. **Input data** - What to process
3. **Output format** - How to structure results
4. **Success criteria** - How to know it's done correctly

**Template:**
```
Task: [Specific action]
Input: [Data or context]
Output format: [Structure/format needed]
Constraints: [Any limitations or requirements]
```

**Example:**
```
Task: Classify sentiment for each review
Input: 50 customer reviews (attached)
Output format: JSON array with {review_id, sentiment: positive/negative/neutral, confidence: 0-1}
Constraints: Use conservative thresholds - mark as neutral if unclear
```

### Managing Dependencies

Track what depends on what:

```yaml
execution_graph:
  task_1:
    agent: gemini
    depends_on: []
  task_2:
    agent: claude
    depends_on: [task_1]
  task_3:
    agent: gemini
    depends_on: [task_1]
  task_4:
    agent: claude
    depends_on: [task_2, task_3]
```

## Error Handling in Orchestration

### Fallback Strategies

When Gemini task fails:
1. Retry with clarified instructions
2. Break into smaller subtasks
3. Handle task directly with Claude
4. Skip non-critical tasks

When Claude task fails:
1. Re-analyze requirements
2. Simplify approach
3. Request additional context

### State Management

Maintain conversation state across agent handoffs:

```
Context to preserve:
- Original user request
- Execution plan
- Completed tasks
- Pending tasks
- Intermediate results
- Dependencies
```

## Quality Assurance

### Output Validation

Before returning final results:
- [ ] All subtasks completed successfully?
- [ ] Results consistent and coherent?
- [ ] Original request fully addressed?
- [ ] No contradictions between agent outputs?
- [ ] Quality meets standards?

### Synthesis Standards

When combining outputs from multiple agents:
1. Resolve any conflicts or inconsistencies
2. Ensure unified voice and style
3. Fill gaps between components
4. Add context and transitions
5. Verify logical flow

## Performance Optimization

### Minimize Agent Switching

- Batch related tasks for same agent
- Reduce unnecessary back-and-forth
- Parallelize when possible

### Task Batching

Instead of:
```
Gemini: Process review 1
Gemini: Process review 2
Gemini: Process review 3
...
```

Use:
```
Gemini: Process all 50 reviews in one task
```

## Common Orchestration Patterns

### Pattern 1: Extract-Transform-Load (ETL)

```
Gemini: Extract data from sources
Claude: Transform and analyze
Claude: Load into final format/report
```

### Pattern 2: Analysis Pipeline

```
Gemini: Summarize raw data
Claude: Identify patterns and insights
Claude: Generate recommendations
Gemini: Validate recommendations against data
Claude: Finalize report
```

### Pattern 3: Content Generation

```
Claude: Create outline and structure
Gemini: Generate initial content for sections
Claude: Refine, add depth, ensure coherence
Claude: Final edit and polish
```

### Pattern 4: Research Synthesis

```
Gemini: Classify and tag sources
Gemini: Extract key points from each source
Claude: Synthesize cross-source insights
Claude: Write comprehensive analysis
```

## Coordination Checklist

Before starting orchestration:
- [ ] Task complexity justifies multi-agent approach?
- [ ] Clear plan for agent roles?
- [ ] Dependencies mapped?
- [ ] Success criteria defined?
- [ ] Fallback strategy in place?

During execution:
- [ ] Instructions to Gemini are clear?
- [ ] Tracking completed vs pending tasks?
- [ ] Validating intermediate outputs?

After completion:
- [ ] All components integrated properly?
- [ ] Final output meets requirements?
- [ ] No orphaned or unused results?

## Anti-Patterns to Avoid

❌ **Over-orchestration** - Using multiple agents when one would suffice
❌ **Unclear delegation** - Vague instructions to secondary agent
❌ **Lost context** - Forgetting what each agent is doing
❌ **Serial when parallel** - Processing sequentially when tasks are independent
❌ **No validation** - Blindly trusting agent outputs without review

## Debugging Orchestration Issues

When orchestration isn't working:

1. **Review the plan** - Is task breakdown logical?
2. **Check instructions** - Are Gemini instructions clear?
3. **Verify dependencies** - Are tasks in correct order?
4. **Examine handoffs** - Is context preserved?
5. **Test components** - Do individual tasks work?

## Documentation Standards

Document orchestration plans:
```markdown
## Execution Plan

**Goal:** [What we're trying to achieve]

**Tasks:**
1. [Task 1] - Agent: Claude/Gemini - Status: Pending/Complete
2. [Task 2] - Agent: Claude/Gemini - Status: Pending/Complete

**Dependencies:**
- Task 2 requires Task 1 completion

**Success Criteria:**
- [How we know we're done]
```