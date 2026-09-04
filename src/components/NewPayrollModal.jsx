import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const NewPayrollModal = ({
  showNewPayrollModal,
  setShowNewPayrollModal,
  newPayrollData,
  setNewPayrollData,
  employeesList,
  handleEmployeeSelect,
  handleSubmitNewPayroll,
  loading,
  showNotification
}) => {
  const [localEmployeesList, setLocalEmployeesList] = useState([]);

  useEffect(() => {
    setLocalEmployeesList(employeesList);
  }, [employeesList]);

  return (
    showNewPayrollModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-blue-900">
              Add New Payroll Entry
            </h2>
            <button
              onClick={() => setShowNewPayrollModal(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={24} />
            </button>
          </div>

          {/* Employee Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee Name
              </label>
              <select
                value={newPayrollData.employeeName}
                onChange={(e) => handleEmployeeSelect(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              >
                <option value="">Select Employee</option>
                {localEmployeesList.map((employee) => (
                  <option
                    key={employee.employeeId}
                    value={employee.employeeName}
                  >
                    {employee.employeeName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee ID
              </label>
              <input
                type="text"
                value={newPayrollData.employeeId}
                readOnly
                className="w-full bg-gray-100 border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year
              </label>
              <input
                type="number"
                value={newPayrollData.year}
                onChange={(e) =>
                  setNewPayrollData({
                    ...newPayrollData,
                    year: parseInt(e.target.value),
                  })
                }
                className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Month
              </label>
              <select
                value={newPayrollData.month}
                onChange={(e) =>
                  setNewPayrollData({
                    ...newPayrollData,
                    month: parseInt(e.target.value),
                  })
                }
                className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              >
                <option value={1}>January</option>
                <option value={2}>February</option>
                <option value={3}>March</option>
                <option value={4}>April</option>
                <option value={5}>May</option>
                <option value={6}>June</option>
                <option value={7}>July</option>
                <option value={8}>August</option>
                <option value={9}>September</option>
                <option value={10}>October</option>
                <option value={11}>November</option>
                <option value={12}>December</option>
              </select>
            </div>
          </div>

          {/* Earnings and Deductions Columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Earnings Column */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-900 mb-4">
                Earnings
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Basic Salary
                  </label>
                  <input
                    type="number"
                    value={newPayrollData.basic}
                    onChange={(e) =>
                      setNewPayrollData({
                        ...newPayrollData,
                        basic: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Leave Travel Allowance
                  </label>
                  <input
                    type="number"
                    value={newPayrollData.lta}
                    onChange={(e) =>
                      setNewPayrollData({
                        ...newPayrollData,
                        lta: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bonus
                  </label>
                  <input
                    type="number"
                    value={newPayrollData.bonus}
                    onChange={(e) =>
                      setNewPayrollData({
                        ...newPayrollData,
                        bonus: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Overtime
                  </label>
                  <input
                    type="number"
                    value={newPayrollData.overtime}
                    onChange={(e) =>
                      setNewPayrollData({
                        ...newPayrollData,
                        overtime: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Other Allowance
                  </label>
                  <input
                    type="number"
                    value={newPayrollData.otherAllowances}
                    onChange={(e) =>
                      setNewPayrollData({
                        ...newPayrollData,
                        otherAllowances: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900"
                  />
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center font-semibold text-green-700">
                    <span>Gross Salary</span>
                    <span>
                      ₹
                      {(
                        newPayrollData.basic +
                        newPayrollData.lta +
                        newPayrollData.bonus +
                        newPayrollData.overtime +
                        newPayrollData.otherAllowances
                      ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Deductions Column */}
            <div className="bg-red-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-red-900 mb-4">
                Deductions
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PF
                  </label>
                  <input
                    type="number"
                    value={newPayrollData.pf}
                    onChange={(e) =>
                      setNewPayrollData({
                        ...newPayrollData,
                        pf: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Loan
                  </label>
                  <input
                    type="number"
                    value={newPayrollData.loan}
                    onChange={(e) =>
                      setNewPayrollData({
                        ...newPayrollData,
                        loan: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Other Deduction
                  </label>
                  <input
                    type="number"
                    value={newPayrollData.otherDeductions}
                    onChange={(e) =>
                      setNewPayrollData({
                        ...newPayrollData,
                        otherDeductions: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900"
                  />
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center font-semibold text-red-700">
                    <span>Total Deduction</span>
                    <span>
                      ₹
                      {(
                        newPayrollData.pf +
                        newPayrollData.loan +
                        newPayrollData.otherDeductions
                      ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Net Salary Calculation */}
          <div className="bg-gray-100 p-4 rounded-lg mb-6">
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Net Salary</span>
              <span className="text-blue-900">
                ₹
                {(
                  newPayrollData.basic +
                  newPayrollData.lta +
                  newPayrollData.bonus +
                  newPayrollData.overtime +
                  newPayrollData.otherAllowances -
                  (newPayrollData.pf +
                    newPayrollData.loan +
                    newPayrollData.otherDeductions)
                ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Status and Pay Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={newPayrollData.status}
                onChange={(e) =>
                  setNewPayrollData({
                    ...newPayrollData,
                    status: e.target.value,
                  })
                }
                className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              >
                <option value="processed">Pending</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pay Date
              </label>
              <input
                type="date"
                value={newPayrollData.payDate}
                onChange={(e) =>
                  setNewPayrollData({
                    ...newPayrollData,
                    payDate: e.target.value,
                  })
                }
                className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setShowNewPayrollModal(false)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitNewPayroll}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Submit"}
            </button>
          </div>
        </div>
      </div>
    )
  );
};

export default NewPayrollModal;