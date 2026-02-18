
import React from 'react'

export const Card: React.FC<{ children: React.ReactNode, className?: string, title?: string }> = ({ children, className, title }) => (
  <div className={`bg-white shadow rounded-lg px-4 py-5 sm:p-6 ${className}`}>
    {title && <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">{title}</h3>}
    {children}
  </div>
)
