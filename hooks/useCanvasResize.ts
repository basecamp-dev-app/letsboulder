import { useState, useEffect, useCallback } from 'react';

export const useCanvasResize = (imageUrl: string) => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) {
      setContainerNode(node);
    }
  }, []);

  useEffect(() => {
    if (!imageUrl) return;

    let isActive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageLoaded(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageError(false);

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (!isActive) return;
      setImageElement(img);
      setImageLoaded(true);
    };

    img.onerror = () => {
      if (!isActive) return;
      setImageError(true);
      setImageLoaded(true);
    };

    img.src = imageUrl;

    return () => { isActive = false; };
  }, [imageUrl]);

  useEffect(() => {
    if (!containerNode) return;

    const updateDimensions = () => {
      setDimensions({
        width: containerNode.clientWidth,
        height: containerNode.clientHeight,
      });
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerNode);

    return () => resizeObserver.disconnect();
  }, [containerNode]);

  return { containerRef, dimensions, imageElement, imageLoaded, imageError };
};
