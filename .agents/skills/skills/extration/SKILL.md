---
name: extraction
description: Data extraction and structured information retrieval from unstructured text. Use when tasks require extracting specific information like names, dates, numbers, entities, facts, patterns, or structured data from documents, emails, forms, receipts, invoices, or any text content.
version: 1.0.0
category: processing
agent: gemini
overridable: true
---

# Extraction

This skill provides methods for extracting structured information from unstructured text efficiently.

## Core Extraction Types

### 1. Named Entity Extraction

Extract specific entities from text:

**Common entity types:**
- **People** - Names, titles, roles
- **Organizations** - Companies, institutions, groups
- **Locations** - Cities, countries, addresses
- **Dates/Times** - Temporal references
- **Numbers** - Quantities, percentages, metrics
- **Products** - Items, brands, models
- **Events** - Occurrences, incidents

**Output format:**
```json
{
  "entities": {
    "people": ["John Smith", "Dr. Jane Doe"],
    "organizations": ["Acme Corp", "Stanford University"],
    "locations": ["San Francisco, CA", "Building 5, Room 302"],
    "dates": ["2024-03-15", "next Tuesday"],
    "amounts": ["$1,500", "25%", "100 units"]
  }
}
```

### 2. Key-Value Extraction

Extract paired information (labels and values):

**Use cases:**
- Form data
- Invoice details
- Product specifications
- Configuration settings
- Metadata

**Examples:**
```
Input: "Order #12345 placed on March 15, 2024. Total: $299.99"

Output:
{
  "order_number": "12345",
  "order_date": "2024-03-15",
  "total_amount": "$299.99"
}
```

### 3. Pattern Extraction

Find recurring patterns:

**Common patterns:**
- Email addresses: `name@domain.com`
- Phone numbers: `(555) 123-4567`
- URLs: `https://example.com`
- IDs: `ABC-123-XYZ`
- Codes: `#HASHTAG`, `@mention`

**Validation:**
- Verify pattern matches expected format
- Flag malformed entries
- Note confidence level

### 4. Fact Extraction

Extract specific factual statements:

**Target facts:**
- Who did what?
- When did it happen?
- Where did it occur?
- What was the outcome?
- Why did it happen?

**Format:**
```json
{
  "fact": "Company X acquired Company Y",
  "subject": "Company X",
  "action": "acquired",
  "object": "Company Y",
  "date": "2024-01-15",
  "source": "paragraph 3"
}
```

## Extraction Workflows

### Workflow 1: Single-Pass Extraction

For simple, well-defined extraction:
```
1. Identify target information types
2. Scan text for patterns/keywords
3. Extract matching information
4. Validate and format output
```

### Workflow 2: Multi-Pass Extraction

For complex, nested information:
```
1. First pass: Identify sections/categories
2. Second pass: Extract entities within sections
3. Third pass: Extract relationships
4. Validate and structure output
```

### Workflow 3: Template-Based Extraction

For structured documents (invoices, forms):
```
1. Identify document template/type
2. Map expected fields to locations
3. Extract values from expected positions
4. Handle variations and missing fields
```

## Structured Output Formats

### JSON Format
Best for: Programmatic processing, APIs
```json
{
  "document_type": "invoice",
  "extracted_at": "2024-02-02T10:30:00Z",
  "confidence": 0.95,
  "data": {
    "invoice_number": "INV-2024-001",
    "date": "2024-02-01",
    "items": [
      {"name": "Product A", "quantity": 2, "price": 50.00},
      {"name": "Product B", "quantity": 1, "price": 75.00}
    ],
    "total": 175.00
  }
}
```

### Table Format
Best for: Spreadsheets, databases
```
| Field          | Value           | Confidence |
|----------------|-----------------|------------|
| Invoice #      | INV-2024-001    | 1.00       |
| Date           | 2024-02-01      | 1.00       |
| Customer       | Acme Corp       | 0.95       |
| Total          | $175.00         | 1.00       |
```

### List Format
Best for: Simple enumerations
```
Extracted Phone Numbers:
• (555) 123-4567 - Main office
• (555) 987-6543 - Support line
• (555) 555-0100 - After hours

Extracted Emails:
• contact@example.com
• support@example.com
```

## Quality Standards

### Accuracy
- Extract only present information
- Don't infer or assume
- Preserve original values exactly
- Flag uncertain extractions

### Completeness
- Extract all requested fields
- Note missing information
- Don't skip partial matches
- Process entire document

### Consistency
- Use uniform formatting
- Maintain field naming convention
- Apply same extraction rules throughout
- Handle variations systematically

## Handling Variations

### Date Formats
Normalize to standard format:
```
Input variations:
- "March 15, 2024"
- "15/03/2024"
- "2024-03-15"
- "3/15/24"

Output: "2024-03-15" (ISO format)
```

### Name Variations
Handle different representations:
```
Input variations:
- "John Smith"
- "Smith, John"
- "J. Smith"
- "John Q. Smith, Jr."

Output: Preserve as written, flag variations
```

### Number Formats
Standardize numerical data:
```
Input variations:
- "$1,234.56"
- "1234.56 USD"
- "1.234,56 €"

Output: {"value": 1234.56, "currency": "USD"}
```

## Domain-Specific Extraction

### Invoice/Receipt Extraction
Key fields:
```
Required:
- Invoice/Receipt number
- Date
- Vendor/Merchant
- Total amount

Optional:
- Items with prices
- Tax amount
- Payment method
- Customer details
```

### Resume/CV Extraction
Key sections:
```
- Contact information
- Education (degree, institution, dates)
- Work experience (company, title, dates, description)
- Skills
- Certifications
```

### Email Extraction
Key components:
```
- Sender/Recipients
- Subject
- Date/Time
- Action items
- Mentioned people/companies
- Attachments
```

### Scientific Paper Extraction
Key elements:
```
- Title
- Authors
- Abstract
- Keywords
- Methodology
- Results (data points, statistics)
- Conclusions
```

## Confidence Scoring

Assign confidence to extractions:

**High confidence (0.9-1.0):**
- Exact pattern match
- Clear context
- Standard format
- Multiple confirmations

**Medium confidence (0.6-0.9):**
- Partial pattern match
- Some ambiguity
- Non-standard format
- Single occurrence

**Low confidence (0.0-0.6):**
- Weak pattern match
- High ambiguity
- Unusual format
- Conflicting information

**Output with confidence:**
```json
{
  "field": "phone_number",
  "value": "(555) 123-4567",
  "confidence": 0.95,
  "source": "paragraph 2, line 3"
}
```

## Error Handling

### Missing Information
```json
{
  "field": "email",
  "value": null,
  "status": "not_found",
  "note": "No email address found in document"
}
```

### Ambiguous Information
```json
{
  "field": "total_amount",
  "value": null,
  "status": "ambiguous",
  "candidates": ["$100.00", "$150.00"],
  "note": "Multiple amounts found, unclear which is total"
}
```

### Malformed Data
```json
{
  "field": "phone_number",
  "value": "555-CALL-NOW",
  "status": "invalid_format",
  "note": "Phone number contains letters"
}
```

## Extraction Validation

### Validation Rules

**Format validation:**
```
Email: Must contain @ and domain
Phone: Must match expected pattern
Date: Must be valid calendar date
Amount: Must be numeric
```

**Logical validation:**
```
End date after start date
Total equals sum of items
Required fields present
Values within expected range
```

**Cross-field validation:**
```
State matches zip code
Phone area code matches location
Currency matches vendor country
```

## Batch Processing

When extracting from multiple documents:

### Parallel Extraction
```
For each document:
  1. Extract fields
  2. Validate extraction
  3. Add to results array
  
Output: Array of extraction results
```

### Aggregated Extraction
```
1. Extract from all documents
2. Identify common patterns
3. Cross-validate extractions
4. Generate summary statistics
```

## Output Enrichment

Add metadata to extractions:
```json
{
  "extraction_metadata": {
    "document_id": "doc_12345",
    "extracted_at": "2024-02-02T10:30:00Z",
    "extractor_version": "1.0.0",
    "processing_time_ms": 150
  },
  "extracted_data": {
    "field1": "value1",
    "field2": "value2"
  },
  "quality_metrics": {
    "fields_found": 8,
    "fields_missing": 2,
    "average_confidence": 0.92
  }
}
```

## Performance Optimization

### Targeted Extraction
Focus on specific sections:
```
1. Identify relevant sections by keywords
2. Extract only from relevant sections
3. Skip irrelevant content
```

### Pattern Reuse
Cache common patterns:
```
Define once:
- Date pattern
- Email pattern
- Phone pattern

Apply repeatedly across documents
```

## Quality Assurance Checklist

Before finalizing extraction:
- [ ] All target fields attempted?
- [ ] Confidence scores assigned?
- [ ] Data validated and normalized?
- [ ] Missing fields noted?
- [ ] Ambiguities flagged?
- [ ] Output format correct?
- [ ] Metadata included?

## Common Pitfalls

❌ **Over-extraction** - Extracting irrelevant information
❌ **Under-extraction** - Missing available information
❌ **Hallucination** - Creating information not in source
❌ **Format inconsistency** - Mixing output formats
❌ **No validation** - Not checking extracted values
❌ **Missing metadata** - Not tracking extraction details

## Integration with Other Skills

Extraction often feeds into:
- Classification (categorizing extracted entities)
- Summarization (using extracted facts)
- Analysis (processing extracted data)
- Validation (verifying extracted information)