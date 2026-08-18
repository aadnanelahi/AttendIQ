# Integration Architecture

## Supported Integration Styles
- REST APIs
- Webhooks
- Scheduled imports/exports
- Vendor device adapters
- HR integration
- ERP integration
- Payroll integration

## Rules
External systems must not directly modify core database tables. Integrations use versioned APIs or controlled integration services.
