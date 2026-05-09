# Delete Order Endpoint

## Overview

The delete order endpoint allows authorized users to soft-delete orders by their ID, order number, or accession number. This endpoint marks the order as deleted in the database and updates the audit log.

## Endpoint Details

* **URL:** `/orders/<identifier>`
* **Method:** `DELETE`
* **Authentication:** Requires valid JWT token with appropriate permissions

## Request Parameters

* `identifier`: The ID, order number, or accession number of the order to be deleted

## Response

* **Success (200 OK):**
```json
{
  "status": "success",
  "message": "Order deleted successfully",
  "order_id": "string",
  "accession_number": "string"
}
```
* **Error (404 Not Found):**
```json
{
  "status": "error",
  "message": "Order not found"
}
```
* **Error (500 Internal Server Error):**
```json
{
  "status": "error",
  "message": "Error message"
}
```

## Implementation Details

The delete operation performs a soft delete by:
1. Marking the `status` as 'DELETED'
2. Updating the `details.deleted` field with the actor information and timestamp
3. Logging the deletion action in the audit log

## Security Considerations

* Authentication is required through a valid JWT token
* Proper authorization checks should be implemented based on user permissions

## Related Endpoints

* `POST /orders/create`: Create a new order
* `GET /orders/list`: List existing orders
* `GET /orders/<identifier>`: Get details of a specific order
