export function budgetInclusionLabel(household: boolean, personal: boolean) {
  return household && personal ? 'Personal + Household' :
    household ? 'Household' : personal ? 'Personal' : 'Not included in your budgets'
}
