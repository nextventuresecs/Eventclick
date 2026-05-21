---
name: classification
description: Fast pattern recognition and categorization of text, data, and content. Use when tasks require categorizing documents, classifying sentiment, tagging content, identifying patterns, labeling data, organizing information into predefined categories, or making binary/multi-class decisions.
version: 1.0.0
category: processing
agent: gemini
overridable: true
---

# Classification

This skill provides efficient methods for categorizing and classifying text and data into defined categories.

## Core Classification Types

### 1. Sentiment Classification

Determine emotional tone of text:

**Binary sentiment:**
```
Positive / Negative
```

**Ternary sentiment:**
```
Positive / Neutral / Negative
```

**Granular sentiment:**
```
Very Positive / Positive / Neutral / Negative / Very Negative
```

**Output format:**
```json
{
  "text": "This product is amazing!",
  "sentiment": "positive",
  "confidence": 0.95,
  "score": 4.5
}
```

### 2. Topic Classification

Categorize content by subject matter:

**Single-label:**
```
Input: "Breaking news: Market reaches all-time high"
Output: {"category": "Finance", "confidence": 0.92}
```

**Multi-label:**
```
Input: "Apple announces new AI-powered iPhone"
Output: {
  "categories": ["Technology", "Business", "AI"],
  "primary": "Technology"
}
```

### 3. Intent Classification

Identify user intent or purpose:

**Common intents:**
- Question (seeking information)
- Command (requesting action)
- Complaint (expressing dissatisfaction)
- Feedback (providing input)
- Request (asking for something)

**Output:**
```json
{
  "text": "How do I reset my password?",
  "intent": "question",
  "sub_intent": "account_support",
  "confidence": 0.88
}
```

### 4. Document Type Classification

Identify document format/type:

**Categories:**
- Invoice
- Receipt
- Contract
- Email
- Report
- Resume
- Article
- Legal document

**Output:**
```json
{
  "document_type": "invoice",
  "confidence": 0.97,
  "indicators": ["invoice number", "line items", "total amount"]
}
```

### 5. Priority Classification

Categorize by urgency/importance:

**Levels:**
- Critical / Urgent
- High Priority
- Medium Priority
- Low Priority
- Informational

**Use cases:**
- Support tickets
- Email triage
- Task management
- Alert routing

## Classification Workflows

### Workflow 1: Rule-Based Classification

For well-defined categories:
```
1. Define classification rules
2. Check text against rules
3. Assign category based on matches
4. Handle edge cases
```

**Example rules:**
```
IF contains "urgent" OR "asap" OR "emergency"
   THEN priority = "Critical"
ELSE IF contains "soon" OR "important"
   THEN priority = "High"
ELSE
   THEN priority = "Medium"
```

### Workflow 2: Pattern-Based Classification

For pattern recognition:
```
1. Identify key patterns/features
2. Match patterns against categories
3. Weight pattern strengths
4. Select best-matching category
```

### Workflow 3: Hierarchical Classification

For nested categories:
```
1. Classify at top level (e.g., "Technology")
2. Sub-classify within category (e.g., "Software")
3. Further refine if needed (e.g., "Mobile Apps")
```

**Example hierarchy:**
```
Technology
├── Hardware
│   ├── Computers
│   └── Mobile Devices
└── Software
    ├── Web Apps
    └── Mobile Apps
```

## Output Formats

### Simple Label
```json
{
  "category": "Sports",
  "confidence": 0.89
}
```

### Multi-Category
```json
{
  "primary_category": "Technology",
  "secondary_categories": ["Business", "Innovation"],
  "confidence": {
    "technology": 0.92,
    "business": 0.67,
    "innovation": 0.54
  }
}
```

### Detailed Classification
```json
{
  "text_id": "doc_123",
  "classification": {
    "category": "Customer Feedback",
    "subcategory": "Product Review",
    "sentiment": "positive",
    "intent": "recommendation",
    "priority": "medium"
  },
  "confidence": 0.85,
  "features": {
    "keywords": ["great", "recommend", "quality"],
    "patterns": ["5-star rating", "would buy again"]
  },
  "timestamp": "2024-02-02T10:30:00Z"
}
```

## Classification Strategies

### Keyword-Based
Classify based on presence of keywords:
```
Keywords for "Technical Support":
- error, bug, crash, issue, problem, not working
- help, support, troubleshoot, fix

Keywords for "Sales Inquiry":
- price, cost, purchase, buy, quote, demo
- features, comparison, upgrade
```

### Context-Based
Consider surrounding context:
```
"Apple" in "I ate an apple" → Category: Food
"Apple" in "Apple stock rose" → Category: Finance/Tech
```

### Confidence Thresholds
Set minimum confidence levels:
```
High confidence (>0.9): Auto-classify
Medium confidence (0.7-0.9): Classify with review flag
Low confidence (<0.7): Manual review required
```

## Handling Edge Cases

### Ambiguous Content
```json
{
  "classification": "uncertain",
  "top_candidates": [
    {"category": "Technology", "confidence": 0.52},
    {"category": "Business", "confidence": 0.48}
  ],
  "recommendation": "manual_review"
}
```

### Multiple Valid Categories
```json
{
  "classification": "multi_category",
  "categories": {
    "primary": "News",
    "secondary": ["Politics", "Economics"],
    "tags": ["election", "policy", "market"]
  }
}
```

### Unknown Category
```json
{
  "classification": "unknown",
  "confidence": 0.35,
  "note": "Does not match any defined category",
  "suggested_action": "create_new_category"
}
```

## Quality Metrics

### Accuracy Tracking
```json
{
  "total_classified": 1000,
  "correct_classifications": 920,
  "accuracy": 0.92,
  "by_category": {
    "Technology": {"accuracy": 0.95, "count": 300},
    "Finance": {"accuracy": 0.88, "count": 250},
    "Sports": {"accuracy": 0.94, "count": 450}
  }
}
```

### Confidence Distribution
```
High confidence (>0.9): 70%
Medium confidence (0.7-0.9): 25%
Low confidence (<0.7): 5%
```

## Domain-Specific Classification

### Email Classification
```
Categories:
- Urgent / Action Required
- Important / Read Soon
- Informational
- Marketing / Promotional
- Spam / Junk
- Personal / Social
```

### Customer Support Tickets
```
Categories:
- Technical Issue
- Billing Question
- Feature Request
- Bug Report
- Account Management
- General Inquiry

Priority Levels:
- P0: System Down
- P1: Critical Bug
- P2: Important Feature Issue
- P3: Minor Issue
- P4: Enhancement Request
```

### Content Moderation
```
Categories:
- Safe
- Needs Review
- Potentially Harmful
  ├── Spam
  ├── Offensive Language
  ├── Misinformation
  └── Inappropriate Content
```

### Product Reviews
```
Dimensions:
- Overall Sentiment: Positive/Neutral/Negative
- Aspect Categories:
  ├── Quality
  ├── Price/Value
  ├── Customer Service
  └── Shipping/Delivery
```

## Batch Classification

When classifying multiple items:

### Sequential Processing
```
For each item:
  1. Classify item
  2. Record result
  3. Move to next item

Output: Array of classifications
```

### Parallel Processing
```
Process all items simultaneously

Output: 
{
  "total_items": 100,
  "classified": 98,
  "failed": 2,
  "results": [...]
}
```

### Aggregated Analysis
```
After classification:
1. Count items per category
2. Calculate category distribution
3. Identify trends
4. Generate summary

Output:
{
  "category_distribution": {
    "Technology": 45,
    "Finance": 30,
    "Sports": 25
  },
  "dominant_sentiment": "positive",
  "trends": "Increased tech content over time"
}
```

## Classification Rules

### Exclusivity Rules
```
# Mutually exclusive categories
IF classified as "Spam"
   THEN cannot be "Important"

# Hierarchical constraints
IF classified as "Technical Issue"
   MUST also have sub-category
```

### Validation Rules
```
# Required fields
Classification must include:
- Primary category
- Confidence score
- Timestamp

# Confidence thresholds
IF confidence < 0.5
   THEN flag for review
```

## Performance Optimization

### Category Caching
```
Cache frequently used category definitions
Reuse pattern matches across documents
Pre-compile classification rules
```

### Early Termination
```
IF confidence > 0.95 after initial check
   THEN skip additional analysis
   RETURN classification
```

### Focused Classification
```
Instead of checking all categories:
1. Pre-filter likely categories
2. Check only promising candidates
3. Return best match
```

## Confidence Calibration

Adjust confidence based on factors:

**Increase confidence when:**
- Multiple strong indicators
- Clear, unambiguous text
- Matches known patterns
- Consistent with context

**Decrease confidence when:**
- Weak or few indicators
- Ambiguous or vague text
- Mixed signals
- Unusual phrasing

**Confidence formula example:**
```
confidence = (
  keyword_match_score * 0.4 +
  pattern_match_score * 0.3 +
  context_score * 0.2 +
  historical_accuracy * 0.1
)
```

## Quality Assurance Checklist

Before finalizing classification:
- [ ] Category is well-defined?
- [ ] Confidence score calculated?
- [ ] Edge cases handled?
- [ ] Validation rules applied?
- [ ] Output format correct?
- [ ] Metadata included?
- [ ] Ambiguities flagged?

## Common Pitfalls

❌ **Over-fitting** - Too many specific categories
❌ **Under-fitting** - Too few broad categories
❌ **Keyword reliance** - Ignoring context
❌ **Bias** - Favoring certain categories
❌ **Threshold issues** - Wrong confidence cutoffs
❌ **Missing validation** - Not checking results

## Error Handling

### Unclassifiable Content
```json
{
  "status": "unclassifiable",
  "reason": "insufficient_information",
  "attempted_categories": ["Tech", "Business"],
  "max_confidence": 0.42,
  "action": "request_more_context"
}
```

### Conflicting Signals
```json
{
  "status": "conflicting",
  "conflicts": [
    {"category": "Positive", "indicators": ["great", "love"]},
    {"category": "Negative", "indicators": ["but", "disappointed"]}
  ],
  "resolution": "Mixed sentiment - mostly positive with concerns"
}
```

## Integration with Other Skills

Classification often works with:
- Extraction (extract features, then classify)
- Summarization (classify summaries)
- Validation (verify classification accuracy)
- Routing (route based on classification)

## Reporting Classification Results

### Individual Result
```json
{
  "item_id": "12345",
  "category": "Technology",
  "confidence": 0.89,
  "classified_at": "2024-02-02T10:30:00Z"
}
```

### Batch Results
```json
{
  "batch_id": "batch_001",
  "total_items": 100,
  "summary": {
    "Technology": 45,
    "Finance": 30,
    "Sports": 20,
    "Other": 5
  },
  "average_confidence": 0.87,
  "low_confidence_items": 8
}
```