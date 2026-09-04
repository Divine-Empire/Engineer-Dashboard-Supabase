import React from 'react';
import ModalWrapper from '../ModalWrapper';

export function Modal({ isOpen, onClose, title, children, size }) {
  let maxWidth = 'max-w-lg';
  if (size === '2xl') maxWidth = 'max-w-2xl';
  else if (size === '3xl') maxWidth = 'max-w-3xl';
  else if (size === '4xl') maxWidth = 'max-w-4xl';
  else if (size === '5xl') maxWidth = 'max-w-5xl';
  else if (size === '6xl') maxWidth = 'max-w-6xl';
  else if (size === '7xl') maxWidth = 'max-w-7xl';
  else if (size === 'full') maxWidth = 'max-w-full';

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title={title} maxWidth={maxWidth}>
      {children}
    </ModalWrapper>
  );
}
