import { describe, it, expect } from 'vitest';
import { PlanSchema } from '../../packages/protocol/src/index.ts';

describe('Planner output validation', () => {
  it('parses a valid plan', () => {
    const raw = {
      goal: 'Add authentication',
      tasks: [
        {
          display_id: 'TASK-001',
          title: 'Create user model',
          description: 'Add User schema',
          acceptance_criteria: ['User can be created'],
          expected_files: ['src/models/User.ts'],
          verification_commands: ['npm test'],
          depends_on: [],
          risk: 'medium',
        },
      ],
    };
    const plan = PlanSchema.parse(raw);
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0]!.display_id).toBe('TASK-001');
  });

  it('rejects plan missing goal', () => {
    expect(() => PlanSchema.parse({ tasks: [] })).toThrow();
  });

  it('rejects plan with invalid risk value', () => {
    expect(() =>
      PlanSchema.parse({
        goal: 'x',
        tasks: [
          {
            display_id: 'T-1',
            title: 't',
            description: 'd',
            acceptance_criteria: [],
            expected_files: [],
            verification_commands: [],
            depends_on: [],
            risk: 'critical', // invalid
          },
        ],
      })
    ).toThrow();
  });

  it('rejects plan with non-array tasks', () => {
    expect(() => PlanSchema.parse({ goal: 'x', tasks: 'not-an-array' })).toThrow();
  });
});
