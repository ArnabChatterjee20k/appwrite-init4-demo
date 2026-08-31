import { pgTable, serial, text, pgEnum } from 'drizzle-orm/pg-core';

// available -> nobody holds it | booked -> committed, durable
export const seatStatus = pgEnum('seat_status', ['available', 'booked']);

export const seats = pgTable('seats', {
  id: serial('id').primaryKey(),
  label: text('label').notNull(),
  status: seatStatus('status').notNull().default('available'),
  bookedBy: text('booked_by'),
});

export type Seat = typeof seats.$inferSelect;
