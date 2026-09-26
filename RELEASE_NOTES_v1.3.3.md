# Kvitt 1.3.3

## MCP improvements

- `create_expense` can now omit `group_id` to use the authenticated user's most recently used active group.
- `create_expense` can now omit `paid_by_user_id` to use the authenticated user as the payer.
- Expense creation responses now include `group_name`, making it clear where the expense was added.

## API improvements

- `GET /api/groups` now includes `is_default` and `last_used_by_me_at` for each group.
- Fixed `last_activity_at` so a newer settlement is not hidden by an older expense.

## Compatibility

- Existing MCP calls that provide `group_id` and `paid_by_user_id` continue to work unchanged.
- No database migrations or new dependencies are included.
