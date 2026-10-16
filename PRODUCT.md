# STEP Feedback Portal — Product Description

> The program name ("STEP") and the company name ("Thoughtworks") must be **configurable**, so other organisations running similar programs can use the portal.

## 1. Background

The Thoughtworks STEP program is an 18-month software training program that has run since 2012. It hires students in the final year of their diploma and offers them a STEP internship. The goal is to train, and then hire, highly skilled software developers for Thoughtworks.

Each batch is run by **one program manager** and **4–5 mentors**. Together they hire and train the interns, and staff them on Thoughtworks projects.

## 2. Problem Statement

- Mentors work with the interns every day, five days a week, and see how each one is performing.
- Each month, mentors record feedback for each intern.
- The program manager gives that feedback to the intern in a **one-on-one meeting**.
- After each meeting, the program manager tells the mentors how it went and what new information came up. Mentors can add more context if needed.
- **All of this happens face to face.** As a result:
  - It is hard for all mentors to share the same understanding of each intern's progress, the conversations that took place, and the surrounding context.
  - By the time an intern is about to **graduate or be terminated**, it is hard to remember everything that happened along the way.

## 3. Solution

A web portal where mentors and program managers record all feedback and feedback conversations. Everyone then works from the same record, and it is easy to trace each decision and the circumstances behind it.

## 4. Roles

A single user can hold more than one role.

### 4.1 Mentor
- One or more mentors are assigned to a batch. Each mentor is responsible for the **whole batch**, not a subset of interns.
- Trains the interns and records their progress and feedback.
- Assigns a **color code** and marks interns for **notice**.
- Can be linked to **any running batch**. Mentors come and go: a mentor may work on the current batch, move off it, or be assigned to another batch.

### 4.2 Program Manager
- **One program manager per batch.** One person can be the PM of several batches at the same time.
- Gives feedback to interns in one-on-one meetings.
- Records the feedback conversation.
- Tells the intern their color code, notice, or termination.
- **Can also be a mentor.**
- Can **assign and unassign mentors** for a batch.

### 4.3 Admin
- One or more admins.
- Adds and removes users and assigns their roles.
- Creates batches.
- Onboards interns to a batch.
- **Can also be a mentor and/or a program manager.**

## 5. Color Codes

A color code shows how an intern is performing. It is **not relative to other interns**. It shows how much the intern has learned and improved compared with their own past performance.

- Every intern starts with **no color code**.
- An intern **can graduate without ever getting a color code**.

| Code | Meaning |
|---|---|
| **Green** | Doing excellent work, well beyond what is expected. A role model for the whole batch. Very few interns get green, and some batches have none. |
| **Yellow** | Performing as expected and all good. Expected to help other interns. Likely to move to green. |
| **Borderline Yellow** | Between Yellow and Orange. Performance goes up and down. Most likely to move up. |
| **Orange** | Not performing as expected. Will move to Red without improvement. Not in immediate danger, but staying Orange for a long time leads to Red and possibly notice. |
| **Borderline Red** | Either (a) recently moved toward danger but not in immediate danger, with no notice or termination expected soon unless loose ends stay untied; or (b) was Red and has improved meaningfully, but not enough to be out of danger. |
| **Red** | Danger. The last chance before the intern is given notice (usually **1 month's notice**). |

### Why "Borderline Yellow" and "Borderline Red" exist
The original scale had only Green, Yellow, Orange, and Red. Over time, several interns were in Red at once even though their issues were quite different. For example:

- **Intern A** does not open up in class and is not making friends, but scores around average in tests. A has a good chance of improving, but without a strong signal they may not feel enough urgency to change. → **Borderline Red**
- **Intern B** performs poorly all the time and has behavioural issues that are hard to fix within a few months. B is unlikely to complete the internship to the mentors' standards. → **Red**

## 6. Feedback

- Mentors and program managers write feedback in **Markdown**.
- When writing feedback, the author can:
  - assign a new color code, or leave the current one unchanged;
  - **mark the feedback as notice**, which puts the intern on notice right away (see §10).
- Later, the program manager **delivers** the feedback to the intern and **records the feedback conversation**.
- **All mentors of the batch** can view the feedback conversation and **comment** on it.
- The program manager can **reply** with further comments.

### Feedback lifecycle (summary)
1. A mentor or PM writes feedback, with an optional color code change. If it is marked as notice, the intern goes on notice when it is submitted.
2. The PM holds a one-on-one with the intern and delivers the feedback.
3. The PM records how the conversation went.
4. Mentors and the PM discuss it in a comment thread.

## 7. Onboarding

### Users
- An admin creates a user by entering an **email address** and **name**, and assigns roles.

### Batches
- An admin creates a batch by giving it a **batch name**.
- The admin assigns the **program manager** and **mentors** to the batch.

### Interns
- The admin onboards interns into a batch.
- Onboarding is done mainly through an **Airtable integration**. Mentors and program managers already use Airtable during recruitment.
- Airtable records include: intern **name, email, phone number, diploma branch, parents' names, interview notes**, and more.

## 8. Design

- Design mock-ups: [STEP Mentor Portal (Claude Design)](https://claude.ai/design/p/937031fc-fdf0-4c3a-9742-02d65fb499f5?file=STEP+Mentor+Portal.dc.html&via=share)

## 9. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | PM across batches | A program manager **can lead several batches at the same time**. Each batch still has exactly one PM. |
| 2 | Color code changes | A color code **changes only through a feedback entry**. There is no separate override, so every change is tied to a written reason. Feedback can also leave the code unchanged. |
| 3 | Intern access | **Staff only.** Interns never log in. |
| 4 | Notice & termination | Tracked as an **intern status** with a clear history. See §10. |
| 5 | Airtable | **Repeatable import per batch**, run by an admin or the batch's PM. Interns are matched by **username**: new ones are added and existing ones are updated. Fields edited in the portal are part of the intern record, so a re-import overwrites only the fields that come from Airtable. |
| 6 | Authentication | **Google sign-in.** Only users an admin has already added (by email) can sign in. |
| 7 | Visibility | Mentors and PMs see **only the batches they are currently assigned to**. Admins can see all batches. |

## 10. Intern Status Lifecycle

Color code and status are separate:
- **Color code** describes *performance*.
- **Status** describes *where the intern stands in the program*.

| Status | Meaning |
|---|---|
| **Active** | Default after onboarding. |
| **On Notice** | Formally given notice (usually 1 month). Records the notice start date and the planned end date. |
| **Graduated** | Completed the program. |
| **Terminated** | Let go by the program, usually after the notice period ends. |
| **Withdrawn** | Left of their own accord (for example, resigned or took another offer). |

### How status changes
1. **Giving notice:** A mentor or the PM switches on **"Mark as notice"** on a feedback entry. When the feedback is submitted, the status becomes **On Notice** straight away. The notice runs for **one month** from that date. The start date, end date and the feedback that gave it are recorded.
2. **Delivering it:** The PM still delivers that feedback in a one-on-one and records the conversation, as for any feedback.
3. **Leaving notice:** While an intern is On Notice, the PM can either:
   - **lift** the notice, which sets the status back to **Active** (for example, because the intern improved), or
   - **terminate** the intern, which sets the status to **Terminated**.
4. **Closing out:** The PM can mark an intern **Graduated** or **Withdrawn**. The PM must give a short reason or note.
5. **History:** Every status change is stored with who made it, when, the reason, and a link to the related feedback or conversation. This gives a full timeline when an intern graduates or leaves.

Interns with the status Graduated, Terminated, or Withdrawn are read-only. Their full history (feedback, conversations, comments, color codes, and status changes) stays visible to the batch's current mentors and PM.
