# JIE Mastery AI Tutor - Documentation Index

**Welcome, New Engineer!** 👋

This directory contains all the technical documentation you need to understand, develop, and maintain the JIE Mastery AI Tutor platform.

---

## 📚 Documentation Files

### 1. [TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md)
**Comprehensive Technical Guide** - Read this first!

**What's inside**:
- Complete system architecture overview
- Technology stack details
- Database schema reference
- Authentication & security implementation
- Voice system deep dive
- AI & learning engine explanation
- Payment & subscription system
- File structure guide
- Deployment process
- Environment variables
- Testing strategy

**When to read**: Your first week - this is the foundation

**Length**: ~400 lines (45-60 minutes read)

---

### 2. [QUICK_START_GUIDE.md](./QUICK_START_GUIDE.md)
**Practical Developer Guide** - Your daily reference!

**What's inside**:
- Day-by-day onboarding plan
- Common development tasks (with code examples)
- Code navigation guide
- Debugging checklists
- Architecture patterns
- Production deployment process
- Troubleshooting guide
- Common questions & answers

**When to use**: Daily reference for common tasks

**Length**: ~300 lines (20-30 minutes read)

---

### 3. [API_REFERENCE.md](./API_REFERENCE.md)
**Complete API Documentation** - For integration work!

**What's inside**:
- All HTTP endpoints with examples
- WebSocket API protocol
- Request/response formats
- Error codes & handling
- Rate limits
- Authentication flows
- cURL examples for testing

**When to use**: When working with the API or debugging requests

**Length**: ~400 lines (reference document)

---

## 🚀 Getting Started Path

### Week 1: Foundations
1. **Read**: [TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md) (Sections 1-5)
   - Project Overview
   - System Architecture
   - Technology Stack
   - Database Schema
   - Authentication & Security

2. **Follow**: [QUICK_START_GUIDE.md](./QUICK_START_GUIDE.md) (Day 1-3)
   - Environment setup
   - Start development server
   - Make your first code change

3. **Test**: Run a voice session end-to-end
   - Register → Login → Start Session → Speak → End Session

### Week 2: Deep Dives
1. **Read**: [TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md) (Sections 6-9)
   - Voice System
   - AI & Learning Engine
   - Payment System
   - Key Features

2. **Practice**: [QUICK_START_GUIDE.md](./QUICK_START_GUIDE.md) (Common Tasks)
   - Add an API endpoint
   - Modify database schema
   - Debug WebSocket issues

3. **Reference**: [API_REFERENCE.md](./API_REFERENCE.md)
   - Test endpoints with cURL
   - Understand WebSocket messages

### Week 3: Production Readiness
1. **Read**: [TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md) (Sections 10-15)
   - File Structure
   - Development Workflow
   - Deployment
   - Known Issues

2. **Deploy**: Follow deployment checklist
3. **Monitor**: Review production logs

---

## 🔍 Quick Reference

### Need to find...

| Looking for... | Check this file | Section |
|----------------|-----------------|---------|
| System architecture diagram | TECHNICAL_DOCUMENTATION.md | System Architecture |
| Database table definitions | TECHNICAL_DOCUMENTATION.md | Database Schema |
| How voice sessions work | TECHNICAL_DOCUMENTATION.md | Voice System |
| AI teaching methodology | TECHNICAL_DOCUMENTATION.md | AI & Learning Engine |
| How to add an API endpoint | QUICK_START_GUIDE.md | Task 1 |
| How to modify database | QUICK_START_GUIDE.md | Task 2 |
| WebSocket debugging | QUICK_START_GUIDE.md | Task 5 |
| API endpoint details | API_REFERENCE.md | Relevant section |
| Error response formats | API_REFERENCE.md | Error Responses |
| Rate limits | API_REFERENCE.md | Rate Limits |

---

## 📁 Additional Resources

### In the Codebase
- **`replit.md`**: Project memory/preferences (updated by AI agent)
- **`shared/schema.ts`**: Single source of truth for database schema
- **`server/config/tutor-personalities.ts`**: AI tutor personalities
- **Inline comments**: Throughout the codebase (especially `custom-voice-ws.ts`)

### External Documentation
- **Anthropic**: https://docs.anthropic.com (Claude AI)
- **Deepgram**: https://developers.deepgram.com (Speech-to-text)
- **ElevenLabs**: https://docs.elevenlabs.io (Text-to-speech)
- **Stripe**: https://stripe.com/docs (Payments)
- **Drizzle**: https://orm.drizzle.team (ORM)

---

## 🎯 Learning Objectives

By the end of your onboarding, you should be able to:

**Week 1**:
- [ ] Explain the system architecture in your own words
- [ ] Run the application locally
- [ ] Make a small code change and see it work
- [ ] Understand the database schema
- [ ] Complete a voice session end-to-end

**Week 2**:
- [ ] Add a new API endpoint
- [ ] Modify the database schema
- [ ] Understand the voice session lifecycle
- [ ] Debug common WebSocket issues
- [ ] Modify AI tutor behavior

**Week 3**:
- [ ] Deep dive into WebSocket implementation
- [ ] Understand minute tracking system
- [ ] Work on a medium-sized feature
- [ ] Deploy to production (test environment)
- [ ] Navigate the entire codebase confidently

---

## 🐛 Known Issues & Solutions

### Critical Fixes (Already Applied)
✅ **Railway TLS Proxy WebSocket Issue** - HTTP fallback implemented  
✅ **30-Minute Session Rotation Bug** - Removed (Nov 18, 2025)  
✅ **Quiet Microphone Issue** - 100x gain amplification added  
✅ **5-Minute Inactivity Timeout** - Implemented (Nov 19, 2025)

See [TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md) (Section 15) for details.

---

## 📝 Documentation Maintenance

### When to Update These Docs

**TECHNICAL_DOCUMENTATION.md**:
- Major architecture changes
- New external service integrations
- Database schema changes
- Security updates
- Deployment process changes

**QUICK_START_GUIDE.md**:
- New common tasks identified
- Updated troubleshooting steps
- New debugging patterns

**API_REFERENCE.md**:
- New endpoints added
- Endpoint behavior changes
- New error codes
- Rate limit changes

**Update Frequency**: Monthly review, immediate for breaking changes

---

## 💡 Tips for Success

1. **Read Code, Don't Just Skim**: The codebase has extensive inline comments
2. **Use Logs Extensively**: Backend logs are your best friend for debugging
3. **Test End-to-End**: Don't just test your changes in isolation
4. **Ask Questions Early**: If something doesn't make sense, document it
5. **Update Docs**: When you learn something new, add it to these docs

---

## 🎓 Advanced Topics

Once you're comfortable with the basics, explore these:

1. **WebSocket Security** - `server/middleware/ws-session-validator.ts`
2. **RAG Implementation** - `server/services/embeddings.ts`
3. **Modified Adaptive Socratic Method** - `server/llm/adaptiveSocraticCore.ts`
4. **Audio Processing Pipeline** - `public/audio-processor.js`
5. **Hybrid Minute Tracking** - `server/services/voice-minutes.ts`

---

## 📧 Support & Questions

**Technical Questions**:
1. Check these docs first
2. Review inline code comments
3. Check external service documentation
4. Search for error messages in the codebase

**Escalation Path**:
1. Self-service via docs (80% of questions)
2. Code review with senior engineer (15%)
3. Vendor support (5% - API issues)

---

**Version**: 1.0  
**Last Updated**: November 19, 2025  
**Next Review**: December 19, 2025

---

**Ready to start?** Begin with [TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md) Section 1! 🚀
