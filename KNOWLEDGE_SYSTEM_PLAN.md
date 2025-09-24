## Plan for KnowledgeBase, SemanticCache, and LearningEngine

**Overall Goal:** To enable the Quest System to learn from past executions, store and retrieve relevant information efficiently, and improve its performance over time by leveraging a centralized knowledge system.

### Phase 1: KnowledgeBase (Persistence)

- **Objective:** Implement a persistent storage for structured and unstructured data that the Quest System can refer to.
- **Components:**
  - `KnowledgeBaseService`: A service responsible for interacting with the chosen persistence layer.
  - `KnowledgeItem` (Type/Interface): Defines the structure of data stored in the KnowledgeBase (e.g., `id`, `content`, `tags`, `source`, `timestamp`).
- **Persistence Layer Choice:**
  - **Option A (Simple):** SQLite (already used by `QuestRepository`). Pros: Easy to integrate, file-based, no external dependencies. Cons: Limited scalability for very large datasets, not optimized for complex semantic queries.
  - **Option B (Advanced):** A dedicated vector database (e.g., Pinecone, Weaviate, ChromaDB) or a search engine (e.g., Elasticsearch) with vector capabilities. Pros: Optimized for semantic search, scalable. Cons: Introduces external dependencies, more complex setup.
  - **Recommendation:** Start with SQLite for simplicity and rapid prototyping, and design the `KnowledgeBaseService` with an interface that allows easy swapping to a more advanced solution later if needed.
- **Key Tasks:**
  1.  **Define `KnowledgeItem` type:** In `packages/quest-system/src/shared/types.ts`.
  2.  **Create `KnowledgeBaseService`:** In `packages/quest-system/src/db/` (or a new `packages/quest-system/src/knowledge/` directory). This service will provide methods like `addKnowledge(item: KnowledgeItem)`, `retrieveKnowledge(query: string, limit: number)`, `updateKnowledge(item: KnowledgeItem)`, `deleteKnowledge(id: string)`.
  3.  **Integrate with SQLite:** Implement the `KnowledgeBaseService` using SQLite for initial persistence.
  4.  **Basic Integration with TaskPyramid/GeminiDispatcher:** Allow `GeminiDispatcher` to call `retrieveKnowledge` to augment prompts with relevant information from the KnowledgeBase.

### Phase 2: SemanticCache (Efficiency)

- **Objective:** Implement a caching mechanism that stores responses to frequently asked or semantically similar queries, reducing redundant calls to the Gemini API.
- **Components:**
  - `SemanticCacheService`: A service responsible for caching and retrieving responses.
  - `CacheEntry` (Type/Interface): Defines the structure of cached data (e.g., `queryHash`, `semanticVector`, `response`, `timestamp`, `ttl`).
- **Key Tasks:**
  1.  **Define `CacheEntry` type:** In `packages/quest-system/src/shared/types.ts`.
  2.  **Create `SemanticCacheService`:** In `packages/quest-system/src/cache/` (or integrate into `KnowledgeBaseService` if using a vector DB). This service will provide methods like `get(query: string)`, `set(query: string, response: string)`, `invalidate(query: string)`.
  3.  **Integrate with GeminiDispatcher:** Modify `GeminiDispatcher` to check the `SemanticCacheService` before making a call to the Gemini API. If a relevant cached response is found, return it. Otherwise, make the API call and cache the response.
  4.  **Semantic Similarity (Future Enhancement):** For true semantic caching, this phase would require generating embeddings for queries and responses and using vector similarity search. This can be a later iteration. For initial implementation, a simple hash-based cache can be used.

### Phase 3: LearningEngine (Improvement)

- **Objective:** Develop a mechanism to analyze past quest executions, identify patterns, and use this information to improve future performance (e.g., better prompt generation, more accurate tool selection, optimized task sequencing).
- **Components:**
  - `LearningEngineService`: A service responsible for analyzing past data and generating insights/improvements.
  - `ExecutionLog` (Type/Interface): Captures details of each step in a quest execution (e.g., `level`, `input`, `output`, `duration`, `success/failure`, `tool_calls`).
- **Key Tasks:**
  1.  **Define `ExecutionLog` type:** In `packages/quest-system/src/shared/types.ts`.
  2.  **Log Quest Executions:** Modify `LevelCoordinator` and `TaskPyramid` to log detailed `ExecutionLog` entries for each step of a quest. Store these logs persistently (e.g., in the `KnowledgeBase` or a separate log store).
  3.  **Create `LearningEngineService`:** In `packages/quest-system/src/learning/`. This service will provide methods like `analyzePastExecutions()`, `generatePromptImprovements()`, `suggestToolUsagePatterns()`.
  4.  **Feedback Loop Integration:**
      - **Manual/Offline:** Initially, the `LearningEngineService` can generate reports or suggestions that a human can review and manually apply (e.g., updating prompt templates).
      - **Automated (Future):** Later, integrate the `LearningEngineService` directly with `GeminiDispatcher` or `LevelCoordinator` to dynamically adjust behavior based on learned patterns (e.g., dynamically selecting prompt templates, adjusting parameters for `dispatchAtomic`).
  5.  **Metrics and Analytics:** Integrate with a metrics system (if available) to track performance improvements over time.

### Dependencies & Considerations:

- **Data Model:** Carefully design the data models for `KnowledgeItem`, `CacheEntry`, and `ExecutionLog` to ensure they capture all necessary information for learning and retrieval.
- **Modularity:** Maintain clear separation of concerns between the `KnowledgeBase`, `SemanticCache`, and `LearningEngine` components to allow for independent development and future swapping of implementations.
- **Scalability:** Keep scalability in mind, especially for the KnowledgeBase and SemanticCache, as the amount of data can grow rapidly.
- **Security & Privacy:** Ensure sensitive information is handled appropriately, especially when persisting data.
- **Error Handling:** Implement robust error handling for all new services.
