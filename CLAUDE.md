# LangGraph Travel Quotation Agent - Claude Code Documentation

## Overview

This is a TypeScript-based LangGraph agent that processes travel quotation requests from Gmail emails. The agent reads unread emails, classifies them as travel quotations, extracts relevant data, and creates structured quotation records.

## Quick Start

```bash
# Install dependencies
yarn install

# Set up environment variables (copy from .env.example)
cp .env.example .env

# Run Gmail authentication setup
yarn auth

# Start the agent
yarn start
```

## Architecture

The system uses **LangGraph's StateGraph** with 6 main states:

1. **ReadEmails** - Fetches unread emails from primary inbox
2. **ClassifyEmail** - Uses multi-level classification (pattern + LLM) 
3. **ExtractData** - Extracts travel details using GPT-4o-mini
4. **GenerateQuotation** - Creates structured quotation records
5. **ProcessEmail** - Marks emails as processed and logs results
6. **Finalize** - Completes processing session

## Key Files

### Core Agent
- **`src/agents/simpleQuoteAgent.ts`** - Main StateGraph implementation
- **`src/main.ts`** - Application entry point

### Tools & Integration
- **`src/tools/gmailTools.ts`** - Gmail API integration with OAuth2
- **`src/utils/simpleDataManager.ts`** - JSON data persistence with caching
- **`src/utils/simpleLogger.ts`** - Clean logging system

### AI & Processing
- **`src/prompts/classification.ts`** - B2B/B2C email classification
- **`src/prompts/simpleExtraction.ts`** - Travel data extraction
- **`src/types/simpleQuotation.ts`** - TypeScript interfaces

### Configuration
- **`.env`** - Environment variables (API keys, Gmail OAuth)
- **`package.json`** - Dependencies and scripts

## Data Storage

The system uses JSON files for persistence:

- **`quotations.json`** - Travel quotation records
- **`clients.json`** - Client information
- **`email_tracking.json`** - Email processing history

## Environment Setup

Required environment variables:

```env
# OpenAI API
OPENAI_API_KEY=sk-your-key-here

# Gmail OAuth2 (get via `yarn auth`)
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret  
GMAIL_ACCESS_TOKEN=your-access-token
GMAIL_REFRESH_TOKEN=your-refresh-token

# Optional: LangSmith tracing
LANGCHAIN_TRACING_V2=true
LANGSMITH_API_KEY=your-langsmith-key
```

## Gmail API Setup

1. Create Google Cloud project
2. Enable Gmail API
3. Create OAuth2 credentials
4. Run `yarn auth` to get tokens
5. Add tokens to `.env`

The agent only processes emails from the primary inbox, excluding spam, promotions, social, and updates.

## Performance Optimizations

- **LLM**: Uses GPT-4o-mini-2024-07-18 with temperature=0, maxTokens=1000
- **Gmail**: Parallel email fetching with Promise.all
- **Classification**: Multi-level system with pattern detection + LLM validation
- **Caching**: 30-second TTL for data operations
- **Routing**: Smart StateGraph routing to skip unnecessary steps

## Logging System

Clean, executive-style logging shows only essential information:
- Emails processed per session
- Classification results (COTIZACIÓN B2B/B2C vs NO COTIZACIÓN)  
- Quotations created with IDs
- Processing time and statistics

## Testing & Development

```bash
# Development mode
yarn start

# Build TypeScript
yarn build

# Gmail authentication
yarn auth
```

## Common Issues

1. **Gmail API Errors**: Check OAuth2 credentials and token expiry
2. **OpenAI Rate Limits**: Reduce concurrent processing if needed
3. **Classification Issues**: Review pattern detection in `classification.ts`
4. **Data Persistence**: Check file permissions for JSON files

## Key Technical Patterns

- **StateGraph Workflow**: LangGraph orchestration with conditional routing
- **Multi-level Classification**: Pattern analysis + LLM cross-validation
- **Error Handling**: Silent failures for non-critical operations (labeling)
- **Memory Management**: State cleanup between email processing
- **Performance Monitoring**: Built-in timing and statistics

The system is optimized for efficiency, processing only primary inbox emails with clean logging and robust error handling.