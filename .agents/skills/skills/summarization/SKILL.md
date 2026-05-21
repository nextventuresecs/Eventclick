---
name: summarization
description: Fast and efficient text summarization for large volumes of content. Use when tasks require condensing articles, documents, reports, reviews, transcripts, or any text into key points, extracting main ideas, creating executive summaries, or processing multiple documents quickly.
version: 1.0.0
category: processing
agent: gemini
overridable: true
---

# Summarization

This skill provides efficient methods for condensing text content while preserving key information.

## Core Summarization Approaches

### 1. Extractive Summarization

Select and combine key sentences from original text:

**When to use:**
- Need factual accuracy
- Preserving original phrasing matters
- Quick overview needed

**Process:**
1. Identify topic sentences
2. Extract key facts and figures
3. Preserve critical quotes
4. Maintain chronological or logical order

### 2. Abstractive Summarization

Rephrase and condense in own words:

**When to use:**
- Need concise overview
- Can paraphrase original content
- Synthesizing multiple sources

**Process:**
1. Identify main themes
2. Distill core message
3. Rephrase concisely
4. Add context where needed

## Summarization Types

### Executive Summary

**Target:** Decision-makers, busy stakeholders
**Length:** 10% of original or less
**Focus:** Key findings, recommendations, impact

**Structure:**
```
1. Purpose/Context (1-2 sentences)
2. Key Findings (3-5 bullet points)
3. Recommendations (2-3 actions)
4. Impact/Implications (1-2 sentences)
```

### Technical Summary

**Target:** Technical audience
**Length:** 15-20% of original
**Focus:** Methods, results, technical details

**Include:**
- Problem statement
- Approach/methodology
- Key results with metrics
- Technical implications

### Meeting Notes Summary

**Target:** Attendees and stakeholders
**Length:** Varies by meeting length
**Focus:** Decisions, action items, key discussions

**Structure:**
```
## Decisions Made
- [Decision 1]
- [Decision 2]

## Action Items
- [Task] - Owner: [Name] - Due: [Date]

## Key Discussion Points
- [Topic 1]: [Brief summary]
- [Topic 2]: [Brief summary]

## Next Steps
- [Step 1]
```

### Multi-Document Summary

**Target:** Researchers, analysts
**Length:** Captures themes across sources
**Focus:** Common patterns, contradictions, synthesis

**Approach:**
1. Identify common themes
2. Note areas of agreement
3. Highlight contradictions
4. Synthesize unique insights from each

## Output Formats

### Bullet Points
Best for: Quick scans, lists, key facts
```
Key Points:
• Main finding 1
• Main finding 2
• Main finding 3
```

### Paragraph Form
Best for: Narrative flow, context preservation
```
The document discusses X, focusing on Y. 
Key findings include A, B, and C. The main 
recommendation is to Z.
```

### Structured Template
Best for: Consistent formatting, comparative analysis
```json
{
  "main_topic": "...",
  "key_points": ["...", "...", "..."],
  "recommendations": ["...", "..."],
  "confidence": 0.9
}
```

## Quality Standards

### Accuracy
- Preserve factual information
- Don't introduce new information
- Maintain original meaning
- Verify numbers and dates

### Completeness
- Include all critical points
- Don't omit important context
- Cover all major themes
- Balance different perspectives

### Conciseness
- Remove redundancy
- Eliminate filler words
- Focus on substance
- Target specified length

### Clarity
- Use simple language
- Define technical terms
- Maintain logical flow
- Ensure standalone readability

## Length Guidelines

**Ultra-brief (tweet-length):**
- 1-2 sentences
- Absolute core message only
- Use for social media, headlines

**Brief (paragraph):**
- 3-5 sentences
- Main points and conclusion
- Use for quick updates, emails

**Standard (multiple paragraphs):**
- 10-15% of original
- Key points with context
- Use for reports, articles

**Detailed (comprehensive):**
- 20-30% of original
- Includes supporting details
- Use for technical documents, research

## Summarization Workflow

### Step 1: Scan
- Identify document type
- Note structure (headings, sections)
- Check length and complexity

### Step 2: Identify Key Elements
- Main thesis/purpose
- Supporting arguments
- Evidence and examples
- Conclusions/recommendations

### Step 3: Extract
- Pull key sentences
- Note important data points
- Capture critical quotes
- Flag action items

### Step 4: Synthesize
- Organize extracted content
- Remove redundancy
- Add transitions
- Ensure coherence

### Step 5: Validate
- Check against original
- Verify accuracy
- Ensure completeness
- Meet length target

## Special Cases

### Summarizing Reviews
Focus on:
- Overall sentiment
- Common themes (positive and negative)
- Specific praise or complaints
- Actionable feedback

Output template:
```
Overall Sentiment: [Positive/Negative/Mixed]

Common Praise:
• [Theme 1]: [Details]
• [Theme 2]: [Details]

Common Complaints:
• [Theme 1]: [Details]
• [Theme 2]: [Details]

Key Insights: [2-3 sentences]
```

### Summarizing Research Papers
Focus on:
- Research question
- Methodology
- Key findings
- Implications

Output template:
```
Research Focus: [Question being investigated]
Method: [Approach used]
Key Findings:
• [Finding 1]
• [Finding 2]
Implications: [Impact and significance]
```

### Summarizing Code/Technical Docs
Focus on:
- Purpose/functionality
- Key components
- Usage patterns
- Important constraints

Output template:
```
Purpose: [What it does]
Main Components:
• [Component 1]: [Function]
• [Component 2]: [Function]
Usage: [How to use]
Notes: [Important considerations]
```

## Batch Processing

When summarizing multiple documents:

### Parallel Processing
Process each independently, then:
1. Create individual summaries
2. Identify cross-document themes
3. Generate meta-summary

### Sequential Processing
For related documents:
1. Summarize first document
2. Summarize subsequent docs noting connections
3. Create unified summary

## Quality Assurance Checklist

Before finalizing:
- [ ] All key points captured?
- [ ] Facts accurate?
- [ ] Length meets requirements?
- [ ] No new information added?
- [ ] Clear and concise?
- [ ] Proper format used?
- [ ] Standalone understandable?

## Common Pitfalls

❌ **Too much detail** - Defeating purpose of summary
❌ **Missing context** - Summary unclear without original
❌ **Subjective interpretation** - Adding personal opinions
❌ **Inconsistent format** - Switching styles mid-summary
❌ **Losing nuance** - Over-simplifying complex arguments

## Performance Metrics

Track summarization quality:
- Compression ratio (summary length / original length)
- Information retention (key facts preserved)
- Accuracy score (factual correctness)
- Readability (clarity and flow)
- Usefulness (meets user needs)

## Integration with Other Skills

Summarization often precedes:
- Classification (categorizing summaries)
- Extraction (pulling specific data)
- Analysis (deeper investigation)
- Reporting (incorporating into larger documents)