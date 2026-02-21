## PHASE 1 continued
1. Base functionality: accounts, positions, apis, raycast front-end ✅
2. Prettify the UI and UX (this is a conversation mode - I'll describe in detail, back and forth with hot-reloads) ✅
3. Add cash positions handling ✅
4. Add option to rename assets - custom name. Where over hover and in detailed view it would show original name. This is sometimes needed when Yahoo api returns cryptic names for certain assets.
5. Add a github pipeline for unit testing and linting, with separate PR branch and main treatment. 

## PHASE 2
1. Add portfolio graph over time. Separate command. Two displays: Line chart with adjustable time frame (both range and granularity(day, week:default, month, year)) showing the total asset value over time. Second graph showing same broken into a data series (line) for each account. Without pulling backdated asset valuation, with initial portfolio, this will be a single dot line on the graph - this is fine for this stage.
