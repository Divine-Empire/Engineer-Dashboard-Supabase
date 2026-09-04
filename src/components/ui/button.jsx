import React from 'react';

export function Button({ children, className = '', variant = 'default', size = 'default', ...props }) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50 disabled:pointer-events-none';
  
  let variantStyles = 'bg-blue-600 text-white hover:bg-blue-700';
  if (variant === 'outline') {
    variantStyles = 'border border-slate-200 bg-white hover:bg-slate-100 text-slate-750';
  } else if (variant === 'ghost') {
    variantStyles = 'hover:bg-slate-100 hover:text-slate-900 text-slate-600';
  }

  let sizeStyles = 'h-10 px-4 py-2 text-sm';
  if (size === 'sm') {
    sizeStyles = 'h-8 px-3 text-xs';
  } else if (size === 'lg') {
    sizeStyles = 'h-11 px-8 text-base';
  } else if (size === 'icon') {
    sizeStyles = 'h-9 w-9 p-0';
  }

  return (
    <button className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`} {...props}>
      {children}
    </button>
  );
}
