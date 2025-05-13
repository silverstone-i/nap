


import {
  validateStatusTransition,
  assertStatusAllowed,
} from '../../../modules/activities/logic/budgetLogic.js';

describe('budgetLogic', () => {
  describe('validateStatusTransition', () => {
    it('allows valid transitions', () => {
      expect(() => validateStatusTransition('draft', 'submitted')).not.toThrow();
      expect(() => validateStatusTransition('submitted', 'approved')).not.toThrow();
      expect(() => validateStatusTransition('approved', 'locked')).not.toThrow();
    });

    it('rejects invalid transitions', () => {
      expect(() => validateStatusTransition('draft', 'approved')).toThrow('Invalid status transition from \'draft\' to \'approved\'');
      expect(() => validateStatusTransition('locked', 'approved')).toThrow('Invalid status transition from \'locked\' to \'approved\'');
    });
  });

  describe('assertStatusAllowed', () => {
    it('does not throw if status is allowed', () => {
      expect(() => assertStatusAllowed('approved', ['approved'], 'post costs')).not.toThrow();
    });

    it('throws if status is not allowed', () => {
      expect(() => assertStatusAllowed('draft', ['approved'], 'post costs')).toThrow("Cannot post costs when budget_status is 'draft'");
    });
  });
});