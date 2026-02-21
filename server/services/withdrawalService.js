/**
 * Calculates withdrawal end dates for a treatment.
 * @param {Date|string} treatmentDate
 * @param {number} withdrawalMilkHours
 * @param {number} withdrawalMilkDays
 * @param {number} withdrawalMeatHours
 * @param {number} withdrawalMeatDays
 * @returns {{ withdrawalEndMilk: Date|null, withdrawalEndMeat: Date|null }}
 */
function calcWithdrawalDates(treatmentDate, withdrawalMilkHours, withdrawalMilkDays, withdrawalMeatHours, withdrawalMeatDays) {
  const base = new Date(treatmentDate)
  const totalMilkHours = (withdrawalMilkHours || 0) + (withdrawalMilkDays || 0) * 24
  const totalMeatHours = (withdrawalMeatHours || 0) + (withdrawalMeatDays || 0) * 24
  return {
    withdrawalEndMilk: totalMilkHours > 0
      ? new Date(base.getTime() + totalMilkHours * 60 * 60 * 1000)
      : null,
    withdrawalEndMeat: totalMeatHours > 0
      ? new Date(base.getTime() + totalMeatHours * 60 * 60 * 1000)
      : null,
  }
}

module.exports = { calcWithdrawalDates }
