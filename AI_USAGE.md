# AI usage

This document records AI assistance used while building AXIOM. Update it as the team uses AI tools during implementation, including the tool, affected work, and human review performed.

## Initial project foundation

AI assistance was used to scaffold and document the initial project structure and placeholder frontend. The team should review generated code and documentation before extending it.

## Stage 12 integration

AI assistance was used to connect the React interfaces to existing FastAPI routes, add dataset upload safeguards and integration documentation, and prepare frontend operational pages for datasets, timetable, rooms, bookings, examinations, analytics, the request parser, and disruption proposals. The implementation was reviewed against the existing API schemas and verified with the backend test suite, TypeScript production build, and official baseline schedule validator. No external hosted LLM calls were added. Human review is still required before applying the pending database migrations or using the app outside a trusted development environment.
