# Task uniqueness

At Start, the host sees the task capacity for the currently checked-in players. With enough active tasks, the round starts in no-repeat mode: once a task has been assigned, nobody else receives it that round, even if it was swapped or its player left.

If the pool is too small, Start is disabled until the host checks “I understand and want to start in duplicate mode.” The button then starts duplicate mode. Tasks can be shared between players, but a player never receives the same task twice that round. The selected mode remains visible in host controls. The server checks the current roster and task pool again under the game lock; an acknowledgment for an older roster or pool is rejected.

## Capacity

For N checked-in players, the baseline no-repeat pool excludes swaps: `2N − 2` tasks overall, with Easy/Medium tasks for starting assignments and early catch reassignments, plus tasks of any difficulty (including Hard) for late catch reassignments. With hard threshold H and N > H, that is `N + (N − H − 1)` Easy/Medium and `H − 1` late-phase tasks. The planning estimate adds `ceil(N / 2)` swap tasks, assuming about half the players use a swap. For 33 players and the default threshold of five, the baseline is 60 Easy/Medium plus 4 Hard (64 total); the buffered estimate is 77 Easy/Medium plus 4 Hard (81 total). If the game starts at or below the hard threshold, all assignments can use any difficulty and the baseline is still `2N − 2`, with the same swap buffer added to the estimate.

If the pool covers the baseline but not the buffer, the host can explicitly start in no-repeat mode after acknowledging that swaps may exhaust the pool. The host can add and activate tasks during play. If the pool covers neither baseline nor buffer, the host must acknowledge duplicate mode instead. These estimates are not swap limits; no-repeat allocation continues while fresh tasks remain and never silently repeats. The capacity warning also accounts for late arrivals and host reassignment actions only as they occur.

Hard tasks are optional; spare Easy/Medium tasks can cover late assignments too. Only active, distinct task text counts; capitalization and whitespace differences do not make a new task. Late arrivals, host skips and target moves can use extra tasks beyond this budget. If no eligible fresh task remains, the action fails without changing the game or consuming a player's swap; the host must add or activate another task. Automatic late-player entry stays queued until tasks are available, so it does not block unrelated host actions. A no-repeat round never silently switches to duplicate mode.

## History and existing games

Mode and round history are saved in the existing `games.settings` JSON, so no schema migration is needed. Player task IDs remain in `missions_seen`; the game also retains issued IDs and normalized text, including text snapshots for each player. This prevents player deletion or later task edits from making a used task fresh again. Existing rounds keep cross-player reuse and seed history from the available player records; text edited before this change cannot be reconstructed.

The host cannot change the text of a task already issued in any active or paused round, including a departed or deleted player's task. This keeps players' displayed tasks from changing into repeats outside allocation. Capitalization and whitespace corrections are allowed. Add a new task instead, or edit the issued task after every round using it has ended. Catalog changes and allocation are serialized so an edit cannot race a newly issued task.

Play again clears round history. Starting the next round repeats the capacity check and requires a new UI acknowledgment if the pool is short. Global uniqueness is scoped to one game round, not every game in the database. No public player page receives the full history ledger.
