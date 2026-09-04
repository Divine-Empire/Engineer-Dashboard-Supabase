import React, { useState, useRef, useEffect } from 'react';

const InfoPopover = ({ children, items, title }) => {
  const [show, setShow] = useState(false);
  const [showUp, setShowUp] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const containerRef = useRef(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    if (show && containerRef.current && !isMobile) {
      const timer = setTimeout(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const spaceAbove = rect.top;
        const spaceRight = window.innerWidth - rect.right;

        if (spaceAbove < 200) {
          setShowUp(false);
        } else {
          setShowUp(true);
        }

        if (spaceRight < 150) {
          setAlignRight(true);
        } else {
          setAlignRight(false);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [show, isMobile]);

  return (
    <div
      className="relative inline-block cursor-help"
      onMouseEnter={() => !isMobile && setShow(true)}
      onMouseLeave={() => !isMobile && setShow(false)}
      onClick={() => setShow(!show)}
      ref={containerRef}
    >
      {children}

      {show && items && items.length > 0 && (
        <>
          {isMobile ? (
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4 animate-in fade-in duration-200 overflow-hidden lg:left-64">
              <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-200"
                style={{ maxHeight: '80vh' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Compact Header */}
                <div className="px-4 py-2 md:py-3 border-b border-gray-100 flex items-center justify-center bg-white flex-none z-20">
                  <h2 className="text-[11px] md:text-sm font-black text-gray-800 uppercase tracking-widest text-center">{title}</h2>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto bg-white min-h-0 z-10">
                  <div className="p-4 space-y-3">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0 shadow-sm shadow-indigo-200"></div>
                        <span className="text-[11px] md:text-[13px] font-medium text-gray-700 uppercase leading-snug break-words">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="px-4 py-2 md:py-3 border-t border-gray-100 bg-white flex-none z-20">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShow(false); }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg transition-all active:scale-[0.98] shadow-sm text-[11px] md:text-xs uppercase tracking-widest"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop Popover */
            <div
              className={`absolute z-[300] w-max min-w-[150px] max-w-[260px] bg-white border border-gray-200 shadow-2xl rounded-lg p-3 animate-in fade-in zoom-in-95 duration-200 pointer-events-none
                ${showUp ? 'bottom-full mb-2.5' : 'top-full mt-2.5'}
                ${alignRight ? 'right-0 origin-top-right' : 'left-1/2 -translate-x-1/2 origin-top'}
              `}
            >
              <div className="flex flex-col gap-1.5">
                {title && (
                  <p className="text-[8px] font-medium text-gray-400 uppercase border-b border-gray-100 pb-1 mb-1 tracking-widest text-center whitespace-nowrap">
                    {title}
                  </p>
                )}
                <div className="space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0 shadow-sm shadow-indigo-200"></div>
                      <span className="text-[11px] font-medium text-gray-700 uppercase leading-snug break-words">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Arrow indicator */}
              <div
                className={`absolute border-8 border-transparent drop-shadow-sm
                  ${showUp ? 'top-full border-t-white' : 'bottom-full border-b-white'}
                  ${alignRight ? 'right-4' : 'left-1/2 -translate-x-1/2'}
                `}
              ></div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default InfoPopover;

