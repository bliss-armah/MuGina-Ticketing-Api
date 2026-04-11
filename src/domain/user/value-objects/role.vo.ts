export const VALID_ROLES = ['ORGANIZER', 'ATTENDEE', 'GATE_AGENT'] as const;
export type RoleType = typeof VALID_ROLES[number];

export class RoleVO {
  private readonly value: RoleType;

  constructor(role: string) {
    if (!VALID_ROLES.includes(role as RoleType)) {
      throw new Error(`Invalid role: ${role}`);
    }
    this.value = role as RoleType;
  }

  getValue(): RoleType {
    return this.value;
  }

  equals(other: RoleVO): boolean {
    return this.value === other.value;
  }
}
