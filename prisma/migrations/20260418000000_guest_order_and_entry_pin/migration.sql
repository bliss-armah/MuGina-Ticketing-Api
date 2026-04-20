-- Make Order.userId nullable and add guest fields
ALTER TABLE "orders" ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "orders" ADD COLUMN "guest_name"  TEXT;
ALTER TABLE "orders" ADD COLUMN "guest_email" TEXT;
ALTER TABLE "orders" ADD COLUMN "guest_phone" TEXT;

CREATE INDEX "orders_guest_phone_idx" ON "orders"("guest_phone");

-- Drop the NOT NULL constraint on Ticket.holderId and add entry_pin
ALTER TABLE "tickets" ALTER COLUMN "holder_id" DROP NOT NULL;

ALTER TABLE "tickets" ADD COLUMN "entry_pin" TEXT;

CREATE UNIQUE INDEX "tickets_event_id_entry_pin_key" ON "tickets"("event_id", "entry_pin");
