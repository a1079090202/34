import type Database from 'better-sqlite3';
import { getDb } from '../db';

export interface InstructorView {
  id: number;
  name: string;
  phone: string;
  vehicles: { id: number; plate: string; model: string }[];
}

export function listResources(
  db: Database.Database = getDb(),
): { instructors: InstructorView[]; vehicles: { id: number; plate: string; model: string }[] } {
  const vehicles = db
    .prepare(`SELECT id, plate, model FROM vehicles WHERE active = 1 ORDER BY id`)
    .all() as { id: number; plate: string; model: string }[];
  const instructors = db
    .prepare(`SELECT id, name, phone FROM instructors WHERE active = 1 ORDER BY id`)
    .all() as { id: number; name: string; phone: string }[];
  const bindings = db
    .prepare(`SELECT instructor_id, vehicle_id FROM instructor_vehicles`)
    .all() as { instructor_id: number; vehicle_id: number }[];

  return {
    vehicles,
    instructors: instructors.map((ins) => ({
      ...ins,
      vehicles: bindings
        .filter((b) => b.instructor_id === ins.id)
        .map((b) => vehicles.find((v) => v.id === b.vehicle_id)!)
        .filter(Boolean),
    })),
  };
}

export function isVehicleBoundToInstructor(
  instructorId: number,
  vehicleId: number,
  db: Database.Database = getDb(),
): boolean {
  const row = db
    .prepare(`SELECT 1 FROM instructor_vehicles WHERE instructor_id = ? AND vehicle_id = ?`)
    .get(instructorId, vehicleId);
  return !!row;
}
