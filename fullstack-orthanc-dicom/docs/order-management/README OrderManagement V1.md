# Order Management Service

## Overview

This service manages orders for the DICOM healthcare system.

## Endpoints

* `POST /orders/create`: Create a new order
* `GET /orders/list`: List existing orders with filters
* `GET /orders/all`: List all orders (simplified)
* `GET /orders/all/details`: List all orders with details
* `GET /orders/<identifier>`: Get details of a specific order
* `PUT /orders/<identifier>`: Update an order
* `DELETE /orders/<identifier>`: Soft delete an order
* `DELETE /orders/<identifier>/purge`: Hard delete an order (after soft delete)
* `POST /orders/<identifier>/sync-satusehat`: Sync order to SATUSEHAT
* `POST /orders/<identifier>/create-worklist`: Create worklist from order
* `POST /orders/complete-flow`: Execute complete flow (create order, sync to SATUSEHAT, create worklist)

## Documentation

* [Delete Order Endpoint](docs/order-delete.md)
* [Update Order Endpoint](docs/order-update.md)
* [Sync Order to SATUSEHAT Endpoint](docs/order-sync-satusehat.md)
* [Create Worklist from Order Endpoint](docs/order-create-worklist.md)
* [Complete Flow Endpoint](docs/complete-flow.md)

## Notes

* The service uses JWT authentication for protected endpoints.
* The `identifier` parameter in some endpoints can be the order ID, order number, or accession number.
