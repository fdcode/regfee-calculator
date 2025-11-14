<!-- 260fe1af-ae08-4929-bd82-638285258fb1 454b8b36-d606-4da2-bb5a-86bfd1a453c3 -->
# Add AI Assistant Chat Window to Expert Form

## Overview

Add a chat interface to `/pages/index.tsx` that integrates with the `/api/ask-assistant` endpoint. The chat will handle both JSON responses (auto-fill form and calculate) and string responses (display clarifying questions).

## Implementation Steps

### 1. Create ChatWindow Component

- Create a new component file (e.g., `src/components/ChatWindow.tsx`) or add it inline in `index.tsx`
- Component should include:
- Message history area (scrollable list of messages)
- Text input field with send button
- Loading state indicator
- Message styling for user vs assistant messages

### 2. Integrate ChatWindow into Expert Form Page

- Add ChatWindow to `/pages/index.tsx` (likely as a new section below the Results section)
- Maintain consistent styling with existing Tailwind CSS design

### 3. Implement Message Handling Logic

- When user sends a message:
- Add user message to chat history
- Call `/api/ask-assistant` with the message
- Handle the response:
- **If JSON object**: 
- Extract `agencyId`, `procedureId`, `role`, and `units` from JSON
- Programmatically set form state: `setSelectedAgency`, `setSelectedProcedure`, `setSelectedRole`, `setUnits`
- Call `handleCalculate()` function
- Add assistant message: "I found that fee for you. Here is the result:" followed by the fee result
- **If string**: 
- Add the string as an assistant message to chat history

### 4. Handle Form Auto-fill

- Create a function to parse and validate the JSON response structure
- Map JSON fields to form state variables
- Ensure proper type conversions (e.g., `procedureId` as number, `units` as array)
- Handle edge cases (missing fields, invalid values)

### 5. Display Fee Results in Chat

- When calculation completes after auto-fill:
- Format the fee result (total fee + currency)
- Display it in the chat as part of the assistant's response message

## Files to Modify

- `/src/pages/index.tsx` - Add ChatWindow component and message handling logic

## Technical Details

- Use existing state management (React hooks)
- Match existing Tailwind CSS styling patterns
- Handle loading and error states in chat
- Ensure form state updates trigger re-renders appropriately

### To-dos

- [ ] Create ChatWindow component with message history area, input field, and send button
- [ ] Add ChatWindow section to Expert Form page with proper styling
- [ ] Implement message sending logic that calls /api/ask-assistant endpoint
- [ ] Add logic to detect JSON responses, auto-fill form fields, and trigger calculation
- [ ] Add logic to display string responses as clarifying questions in chat
- [ ] Format and display fee calculation results in chat after auto-fill and calculation