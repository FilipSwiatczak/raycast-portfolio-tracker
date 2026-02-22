## PHASE 1 continued
1. Base functionality: accounts, positions, apis, raycast front-end ✅
2. Prettify the UI and UX (this is a conversation mode - I'll describe in detail, back and forth with hot-reloads) ✅
3. Add cash positions handling ✅
4. Add option to rename assets - custom name. Where over hover and in detailed view it would show original name. This is sometimes needed when Yahoo api returns cryptic names for certain assets. Batch rename is also supported where post-renaming a tooltip asks if other matchins assets should be renamed ✅
5. Add a github pipeline for unit testing and linting, with separate PR branch and main treatment. ✅
6. Fix "Add Position", where after adding, the context returns to search, leading user to believe the next search would add another position. This is a good flow overall. However the next search and "Add" in fact overwrites the previous position. Keep the flow but fix so that the next search Add adds a new position. ✅

## PHASE 2
1. Add portfolio graph over time. Separate command. Two displays: Line chart with adjustable time frame (both range and granularity(day, week:default, month, year)) showing the total asset value over time. Second graph showing same broken into a data series (line) for each account. Without pulling backdated asset valuation, with initial portfolio, this will be a single dot line on the graph - this is fine for this stage.
2. Fix "Search Investments" not to assume an Account but start search, then on found entry, have add to account -> select account (with option to add new account) -> confirm asset details (with option to edit name, units, price) -> add position.
3. Add Mortgage handling as an asset class. On addition ask for Total Value, Current Equity, date of valuation and post code. Create a service to fetch the price percentage change since valuation date based on the postcode (using a property price index).
