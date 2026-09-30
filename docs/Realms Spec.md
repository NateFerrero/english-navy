# Consensus-Based Definition System

## 1. Summary

A collaborative platform for defining words and phrases through continuous, community-driven consensus. The platform avoids rigid voting phases or time limits. Users continuously "pick" the definition they agree with most, engage in structured argument maps, and resolve side discussions into single consensus nodes. Clarifiers are attributes of the Word/Phrase entity, not separate hierarchical nodes.

## 2. Core Data Model & Hierarchy
*   **Realm:** Top-level container (e.g., UAPs / UFOs, Animal Rights).
*   **Word/Phrase Object:** The subject of definition within a Realm. 
    *   *Attributes:* `Name` (e.g., "Mouse"), `Clarifier` (e.g., "Computer Device", "Animal", or "General").
    *   *Rule:* Multiple Word/Phrase objects can exist with the exact same `Name` in the same Realm, distinguished only by their `Clarifier`.
*   **Definition:** The specific meaning attached to a Word/Phrase object. Definitions are **forkable** (creating a new, alternative definition under the same Word/Phrase object).
*   **Structured Argument Map (SAM):** A threaded debate structure attached to a specific Definition.

## 3. Feature Specifications

### 3.1. Continuous Definition Selection ("The Pick")
*   **Mechanic:** No timed voting phases. Users simply select the definition they agree with most for a given Word/Phrase object.
*   **Consensus Display:** The definition with the most current "picks" is displayed as the "Current Definition."
*   **Tie Handling:** If two or more definitions have equal pick counts, they are displayed together as the "Current Definition."
*   **Changing Picks:** Users can change their pick at any time, instantly updating the tallies.

### 3.2. Clarifiers and Forking
*   **Clarifiers (Word-Level Attributes):** When creating or viewing a Word, users specify a Clarifier to disambiguate it. (e.g., Creating "Mouse" with Clarifier: "Computer Device" vs. Creating "Mouse" with Clarifier: "Animal").
*   **No Nested Clarifiers:** Clarifiers are strictly fields on the Word/Phrase object. They do not contain their own sub-hierarchies.
*   **Forking (Definition-Level):** If a user wants to propose a nuanced variation of an existing definition, they "Fork" the definition. This creates a new alternative definition beneath the same Word/Phrase object. Users can then pick between the original and the forked definition.

### 3.3. Structured Argument Map (SAM) & Thread Collapsing
*   **Structure:** Below each definition is a Structured Argument Map. This is a branching, non-linear discussion. Users can create branches (side threads) to debate specific points.
*   **Thread Resolution (The Collapse):** 
    *   A side thread can be "Resolved." 
    *   To resolve, **all members who participated in that side thread must agree** on a single "Final Consensus Message."
    *   Once agreed, the entire side thread collapses into that single message and is attached to the parent thread. 
    *   *Edge Case:* If a participant leaves the platform or goes inactive, they are removed from the required consensus pool for that specific thread after a set inactivity period (system-level rule, not user-timed).
*   **No Timers:** There are no countdowns, deadlines, or timed voting phases anywhere in the platform.

### 3.4. Version History
*   The platform maintains a "Definition History" tab. Users can view past consensus shifts, archived arguments, and previous picks. 
*   "View" button displays the definition in a simple, readable format without complex diff highlighting.

## 4. UI/UX Flow

1.  **Realm Dashboard:** User selects a Realm.
2.  **Word/Phrase List:** User sees a list of all Word/Phrase objects in the Realm. 
    *   *Display:* The `Name` and `Clarifier` are displayed together to distinguish duplicates. 
    *   *Example UI:* 
        *   **Mouse** (Computer Device) - *Definition: A handheld pointing device...*
        *   **Mouse** (Animal) - *Definition: A small rodent...*
3.  **Word/Phrase View:** User taps a specific Word/Phrase object (e.g., "Mouse [Computer Device]").
    *   *Top of screen:* Current Definition(s) (with pick counts).
    *   *Below:* Alternative/Forked Definitions (with pick counts).
    *   *Action:* Users tap "Pick" on their preferred definition.
4.  **Definition View:** User taps a definition to view its Structured Argument Map.
    *   *Main Thread:* Displays top-level arguments.
    *   *Side Threads:* Branching conversations. 
    *   *Resolve Button:* Only visible/active to participants of a side thread. Once all agree, the thread visibly folds into a single message.
5.  **Notifications:** Triggered by actions, not time. 
    *   *"John forked your definition for Mouse (Computer Device)."*
    *   *"A thread you participated in has been resolved and collapsed."*
    *   *"Your definition is now tied for the Current Definition for Mouse (Animal)."*
