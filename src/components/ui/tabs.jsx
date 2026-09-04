import * as React from "react"

const TabsContext = React.createContext(null)

const Tabs = ({ value, onValueChange, children, className = "" }) => {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className} data-state-value={value}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

const TabsList = ({ children, className = "" }) => {
  return (
    <div className={`inline-flex items-center justify-center rounded-lg bg-slate-100 p-1 text-slate-500 ${className}`}>
      {children}
    </div>
  )
}

const TabsTrigger = ({ value, onClick, children, className = "" }) => {
  const context = React.useContext(TabsContext)
  if (!context) return null
  const isActive = context.value === value
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-state={isActive ? "active" : "inactive"}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 select-none ${className}`}
      onClick={(e) => {
        if (onClick) onClick(e);
        context.onValueChange(value);
      }}
    >
      {children}
    </button>
  )
}

const TabsContent = ({ value, children, className = "" }) => {
  const context = React.useContext(TabsContext)
  if (!context) return null
  const isActive = context.value === value
  if (!isActive) return null
  return (
    <div
      role="tabpanel"
      data-state="active"
      className={`mt-2 focus-visible:outline-none ${className}`}
    >
      {children}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
