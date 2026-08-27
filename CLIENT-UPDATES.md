# Client update workflow

## Ticker updates

The homepage ticker and the full updates archive both read from:

`assets/ticker-updates.json`

To add a new update, add a new object at the top of the `updates` array:

```json
{
  "date": "2026-10-09",
  "time": "06:00 EDT",
  "title": "Mission America opens in Honolulu",
  "body": "Will begins the first marathon of the 50-state sequence."
}
```

The homepage ticker automatically shows the first five updates in the file. The `updates.html` page lists every update in the file with its date and time.

For a nontechnical client workflow, the next step would be replacing this JSON file with a small admin form, Google Sheet, or Airtable feed so the client can post updates without touching site files.
