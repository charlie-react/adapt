<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


# ADAPT Project Instructions

## 1. Project Mission

ADAPT is an AI-powered learning accommodation engine.

Its purpose is to help learners access, interact with, and demonstrate learning when the normal way of interacting with educational material creates a barrier.

ADAPT is not simply a document converter, accessibility checker, or text-to-speech tool.

The core idea is:

> ADAPT changes the way learning happens, not what the learner is expected to learn.

The system should identify the underlying learning objective and find accessible ways for a learner to engage with the material and demonstrate that objective.

The initial goal is a working proof of concept for a hackathon, not a production-ready education platform.

Do not over-engineer the MVP.


## 2. Core Product Principles

### Preserve the learning objective

Every adaptation should preserve the underlying learning objective unless the user explicitly changes the learning goal.

Before implementing an adaptation, ask:

- What is the learner actually expected to learn?
- What is the learner actually expected to demonstrate?
- What part of the existing experience creates the barrier?
- Can the interaction be changed without removing or weakening the learning objective?

A physical interaction barrier should not automatically be treated as a knowledge deficit.

### Capability barrier is not knowledge deficit

ADAPT must distinguish between:

- a learner not understanding something
- a learner being unable to access or interact with the way the material is presented

For example, if an assignment requires drawing a diagram but the learner cannot physically use the required drawing interface, ADAPT should explore an equivalent accessible way to demonstrate the relevant knowledge rather than assuming the learner cannot understand the concept.

### Do not make learners adapt to ADAPT

ADAPT itself must be accessible.

Accessibility is a product requirement, not a feature to add later.

The system should aim to support different ways of interacting with it, including keyboard navigation, screen readers, voice interaction, appropriate focus management, semantic structure, readable layouts, and other assistive technologies where relevant.

### Avoid unnecessary disability labels

Learner profiles should primarily describe barriers, needs, preferences, and capabilities rather than forcing learners into rigid disability categories.

Prefer information such as:

- "Cannot independently interpret visual diagrams"
- "Prolonged mouse interaction is difficult"
- "Cannot reliably access spoken lecture content"
- "Prefers text over audio"
- "Uses a screen reader"

rather than making a disability diagnosis the central requirement for personalization.

Do not infer medical conditions or disabilities from learner behavior.


## 3. Adaptation Pipeline

The core ADAPT flow is:

Learning Material
→ Content Analysis
→ Learning Objectives
→ Learner Profile
→ Barrier Identification
→ Adaptation Strategy
→ Accessible Learning Experience
→ Assessment / Demonstration of Competency

The architecture should preserve clear separation between these stages.

Do not collapse everything into one opaque AI prompt when a structured pipeline would provide better reliability, testing, or explainability.

The adaptation engine should be modular enough that different input types and adaptation strategies can be added without rewriting the entire system.


## 4. Source Grounding and Content Integrity

ADAPT must distinguish between:

1. Original/source material
2. AI-generated analysis
3. AI-generated adaptation
4. Learner-generated content

AI-generated content must not be presented as if it came directly from the original source.

Where practical, preserve source traceability such as:

- document title
- page
- section
- slide
- timestamp
- source excerpt

The system should make it possible for a learner to understand where an adaptation came from.

Do not invent facts, learning objectives, diagrams, examples, citations, or source information.

When the source material is ambiguous or insufficient, prefer acknowledging uncertainty over confidently fabricating information.


## 5. AI Architecture

The AI model is a component of ADAPT, not the product itself.

Do not tightly couple the application architecture to a single model provider unless there is a clear technical reason.

The model layer should be replaceable where practical.

Potential providers may include models accessed through services such as AWS Bedrock or other APIs.

Do not choose a model based only on reputation or benchmark scores.

Model selection should eventually be evaluated against ADAPT-specific requirements, including:

- learning-objective extraction
- barrier identification
- adaptation quality
- preservation of learning objectives
- source faithfulness
- hallucination rate
- multimodal understanding where relevant
- latency
- cost

Do not build a model comparison system before the core adaptation workflow exists.


## 6. Learner Data and Privacy

Learner information may include accessibility preferences, learning preferences, learning materials, questions, and assessment information.

Treat learner data as sensitive.

Do not expose learner information unnecessarily to external services.

Do not place unrelated personal information into model prompts simply because it is available.

Keep learner identity, accessibility preferences, learning materials, and learning performance logically separated where practical.

The hackathon should use synthetic or non-sensitive learner profiles and learning materials for demonstrations.

Never require real medical information to demonstrate accessibility functionality.


## 7. Accessibility Requirements

Accessibility applies to both:

1. The learning experiences generated by ADAPT
2. The ADAPT application itself

When building UI:

- Prefer semantic HTML.
- Ensure keyboard accessibility.
- Maintain logical focus order.
- Provide visible focus states.
- Use accessible labels for controls.
- Do not communicate important information through color alone.
- Provide meaningful alternatives for visual information.
- Avoid unnecessary animation and motion.
- Support readable text and appropriate contrast.
- Make interactive controls large and usable.
- Do not create keyboard traps.
- Use ARIA only where semantic HTML is insufficient.
- Ensure dynamic content changes are accessible to assistive technologies.
- Do not assume every learner uses a mouse, touchscreen, sight, or audio.

Accessibility should be considered during implementation and testing, not only during final review.


## 8. Low-Bandwidth and Device Constraints

ADAPT is intended for learners who may have limited connectivity, older devices, or limited digital confidence.

The MVP should therefore favor:

- lightweight pages
- efficient asset loading
- text-first experiences where appropriate
- progressive enhancement
- graceful degradation when richer features are unavailable
- avoiding unnecessary large downloads

Do not attempt to solve every offline-learning problem in the MVP.

Heavy AI processing can happen server-side where appropriate.

The client should not be required to perform unnecessarily expensive computation.


## 9. Multilingual and Local Relevance

ADAPT should not be architected around the assumption that English is the only language learners will use.

The architecture should leave room for multilingual learning experiences and local educational contexts.

However, the MVP should not attempt to support a large number of languages simply for the sake of breadth.

Prioritize demonstrating the core accommodation engine well.

Use realistic African educational contexts when creating demonstration scenarios.

Do not make unsupported assumptions about curricula, institutions, or learner experiences.


## 10. Initial Demonstration Scenarios

The same ADAPT engine should be tested against different accessibility barriers.

Initial scenarios include:

### Visual accessibility

A Computer Science student studying binary trees receives material containing diagrams.

ADAPT should identify visual information, preserve the learning objectives, and provide meaningful descriptions or alternative interactions.

### Physical / motor interaction barrier

A music student is expected to use software requiring extensive clicking, dragging, or keyboard interaction.

ADAPT should distinguish the physical interaction requirement from the underlying learning objective and explore an alternative interaction such as voice-based composition where appropriate.

### Hearing accessibility

An engineering student receives a recorded lecture containing spoken explanations and references to visual material.

ADAPT should provide more than a raw transcript. It should structure the lecture, provide meaningful captions, and connect spoken explanations to relevant visual information where possible.

These scenarios are examples for testing the common engine.

Do not build three separate products for them.


## 11. Product Scope

The first version is a web application.

The MVP should focus on:

- learner profile/preferences
- learning material input
- content analysis
- learning objective extraction
- barrier identification
- adaptation generation
- accessible learning experience
- basic assessment or demonstration of competency

Potential inputs include:

- PDF
- text
- images
- URLs
- eventually audio and video

Do not build a mobile application, browser extension, LMS integration, or complete education platform as part of the initial MVP unless it becomes necessary for the core proof of concept.

Future versions may allow ADAPT to operate as a layer on top of existing learning systems.

The long-term concept is:

> Keep your LMS. Keep your content. Keep your curriculum. Add ADAPT.


## 12. Architecture and Code Quality

Prefer a modular architecture with clear boundaries between:

- UI
- learner profiles
- content ingestion
- content analysis
- AI/model providers
- adaptation strategies
- assessment
- storage
- authentication

Do not put business logic directly into UI components when it can be separated.

Prefer small, composable functions and components over large files with unrelated responsibilities.

Keep types explicit and meaningful.

Avoid premature abstractions.

Do not create an abstraction simply because it might be useful someday.

Build the simplest architecture that supports the current requirements while leaving clear extension points for future adaptation strategies and model providers.


## 13. Security

Treat uploaded learning materials and learner-provided content as untrusted input.

Consider:

- prompt injection within uploaded documents
- malicious URLs
- unsafe file uploads
- excessive file sizes
- unauthorized access to learner data
- exposed API keys
- model output being treated as trusted code or HTML
- generated content containing unsafe markup

Never expose API keys in client-side code.

Do not render untrusted AI-generated HTML without appropriate sanitization.

Authentication and authorization should be enforced server-side where required.


## 14. Testing

Testing should focus on the actual behavior that makes ADAPT valuable.

Important tests include:

- learning objectives are preserved
- barriers are correctly identified
- adaptations remain grounded in source material
- unsupported claims are not fabricated
- learner preferences are respected
- accessibility requirements are maintained
- different input types are handled safely
- model failures are handled gracefully

Where possible, create reusable evaluation cases for ADAPT's adaptation engine.

A model response that sounds fluent is not necessarily a correct ADAPT response.

The key question is whether the adaptation preserves the intended learning outcome.


## 15. Codex Development Workflow

Codex is an engineering collaborator, not the product decision-maker.

The human developer defines:

- the problem
- product principles
- accessibility principles
- learning objectives
- scope
- acceptable trade-offs
- what ADAPT should and should not do

Codex should help with:

- repository reconnaissance
- technical research
- planning
- architecture proposals
- implementation
- testing
- debugging
- code review
- accessibility review
- documentation
- refactoring

For significant features, prefer this workflow:

1. Understand the requirement.
2. Inspect the relevant code and documentation.
3. Propose a plan.
4. Identify risks and trade-offs.
5. Implement the smallest useful change.
6. Run relevant tests/checks.
7. Review the implementation against ADAPT principles.
8. Document important decisions.

Do not make large unrelated changes while implementing a feature.

Do not silently change product requirements.

If an implementation decision affects the core product behavior, surface the decision before proceeding.


## 16. Documentation and Decision Records

Important architectural and product decisions should be documented.

Use `docs/` for project documentation.

When Codex makes a meaningful technical proposal, record important decisions including:

- problem
- proposed solution
- alternatives considered
- decision
- reason for the decision
- consequences

Do not create documentation solely for the sake of creating documentation.

Documentation should help future contributors understand why the system works the way it does.


## 17. Reusable Codex Skills

Where useful, create reusable Codex workflows for recurring project reviews.

Potential skills include:

- accessibility review
- adaptation/objective preservation review
- AI safety and source-grounding review
- security review
- demo readiness review

These skills should inspect the actual implementation and provide actionable findings.

Do not create skills merely to demonstrate that skills exist.


## 18. What ADAPT Should Not Become

Do not allow ADAPT to drift into:

- a generic chatbot
- a generic AI tutor
- a document-to-audio converter
- a simple PDF summarizer
- an accessibility compliance checker
- a replacement for existing LMS platforms
- a system that lowers learning objectives because a learner has a disability
- a system that requires learners to disclose unnecessary medical information

AI should support the accommodation process, not become the product's identity.


## 19. MVP Decision Rule

When deciding whether to add a feature, ask:

1. Does it help a learner overcome a real learning-access barrier?
2. Does it preserve the underlying learning objective?
3. Does it improve the core ADAPT proof of concept?
4. Can it be demonstrated reliably?
5. Does it introduce unnecessary complexity?

If a feature does not contribute meaningfully to the core proof of concept, defer it.


## 20. Guiding Principle

When there is uncertainty about an implementation decision, return to the central idea:

> A learner should not have to fit into the way education was designed.

ADAPT should make learning more flexible without lowering what the learner is expected to learn.