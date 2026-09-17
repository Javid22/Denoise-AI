# Optional cost safety net: emails budget_alert_email if AWS spend
# approaches or exceeds monthly_budget_usd, so a free-tier expiry or an
# accidental extra resource never turns into a silent surprise charge.
# Skipped entirely if budget_alert_email is left blank.

resource "aws_budgets_budget" "cost_alert" {
  count = var.budget_alert_email != "" ? 1 : 0

  name         = "${var.project_name}-monthly-budget"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Warn early, before the limit is actually reached.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  # Warn if spend is on track to exceed the limit by month's end, even
  # before it actually has.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
