


import {
  validateStatusTransition,
  assertStatusAllowed,
} from '../../../modules/activities/logic/templateLogic.js';

describe('Integration: budgetLogic', () => {
  describe('Status transitions', () => {
    it('should allow valid transitions through workflow', () => {
      expect(() => validateStatusTransition('draft', 'submitted')).not.toThrow();
      expect(() => validateStatusTransition('submitted', 'approved')).not.toThrow();
      expect(() => validateStatusTransition('approved', 'locked')).not.toThrow();
    });

    it('should reject invalid jumps or regressions', () => {
      expect(() => validateStatusTransition('draft', 'approved')).toThrow();
      expect(() => validateStatusTransition('locked', 'approved')).toThrow();
    });
  });

  describe('Status assertions', () => {
    it('should allow actions in valid status', () => {
      expect(() =>
        assertStatusAllowed('approved', ['approved', 'locked'], 'post cost')
      ).not.toThrow();
    });

    it('should reject actions in invalid status', () => {
      expect(() =>
        assertStatusAllowed('draft', ['approved'], 'post cost')
      ).toThrow(/Cannot post cost when budget_status is 'draft'/);
    });
  });
});