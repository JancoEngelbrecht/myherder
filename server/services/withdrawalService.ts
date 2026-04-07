interface WithdrawalDates {
  withdrawalEndMilk: Date | null
  withdrawalEndMeat: Date | null
}

/**
 * Calculates withdrawal end dates for a treatment.
 */
function calcWithdrawalDates(
  treatmentDate: Date | string,
  withdrawalMilkHours: number,
  withdrawalMilkDays: number,
  withdrawalMeatHours: number,
  withdrawalMeatDays: number
): WithdrawalDates {
  const base = new Date(treatmentDate)
  const totalMilkHours = (withdrawalMilkHours || 0) + (withdrawalMilkDays || 0) * 24
  const totalMeatHours = (withdrawalMeatHours || 0) + (withdrawalMeatDays || 0) * 24
  return {
    withdrawalEndMilk:
      totalMilkHours > 0 ? new Date(base.getTime() + totalMilkHours * 60 * 60 * 1000) : null,
    withdrawalEndMeat:
      totalMeatHours > 0 ? new Date(base.getTime() + totalMeatHours * 60 * 60 * 1000) : null,
  }
}

module.exports = { calcWithdrawalDates }
