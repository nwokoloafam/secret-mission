# Task uniqueness

At Start, the host sees the task capacity for the currently checked-in players. With enough active tasks, the round starts in no-repeat mode: once a task has been assigned, nobody else receives it that round, even if it was swapped or its player left.

If the pool is too small, Start is disabled until the host checks “I understand and want to start in duplicate mode.” The button then starts duplicate mode. Tasks can be shared between players, but a player never receives the same task twice that round. The selected mode remains visible in host controls. The server checks the current roster and task pool again under the game lock; an acknowledgment for an older roster or pool is rejected.

## Capacity

For N checked-in players, the standard round budget is `3N − 2`: N starting tasks, N optional swaps, and N − 2 replacement tasks after catches. The final catch ends the game and does not need another task. Early assignments must also fit the easy/medium pool, because hard tasks unlock only at the configured remaining-player threshold. With 33 players and the default threshold of five, the check requires 97 total tasks, including 93 easy/medium tasks.

Only active, distinct task text counts; capitalization and whitespace differences do not make a new task. Late arrivals, host skips and target moves can use extra tasks beyond this budget. If no eligible fresh task remains, the action fails without changing the game or consuming a player's swap; the host must add or activate another task. Automatic late-player entry stays queued until tasks are available, so it does not block unrelated host actions. A no-repeat round never silently switches to duplicate mode.

## History and existing games

Mode and round history are saved in the existing `games.settings` JSON, so no schema migration is needed. Player task IDs remain in `missions_seen`; the game also retains issued IDs and normalized text, including text snapshots for each player. This prevents player deletion or later task edits from making a used task fresh again. Existing rounds keep cross-player reuse and seed history from the available player records; text edited before this change cannot be reconstructed.

The host cannot change the text of a task already issued in any active or paused round, including a departed or deleted player's task. This keeps players' displayed tasks from changing into repeats outside allocation. Capitalization and whitespace corrections are allowed. Add a new task instead, or edit the issued task after every round using it has ended. Catalog changes and allocation are serialized so an edit cannot race a newly issued task.

Play again clears round history. Starting the next round repeats the capacity check and requires a new UI acknowledgment if the pool is short. Global uniqueness is scoped to one game round, not every game in the database. No public player page receives the full history ledger.
