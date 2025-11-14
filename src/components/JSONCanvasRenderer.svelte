 <script lang="ts">
  import { onMount } from 'svelte';
  import type { JSONCanvas, CanvasNode, CanvasEdge } from '../../types/json-canvas';
  // Inline SVGs for icons
  const ChevronDownSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  const ChevronUpSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
  const MaximizeSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';
  const MinimizeSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>';
  import { resolveColor, getCanvasDimensions } from '../../utils/jsonCanvasUtils';
  import JSONCanvasGroup from './JSONCanvasGroup.svelte';
  import JSONCanvasFile from './JSONCanvasFile.svelte';

  export let canvas: JSONCanvas;

  // Viewport state
  let viewportElement: HTMLElement;
  let svgElement: SVGElement;
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Touch state
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartScale = 1;
  let touchStartTranslateX = 0;
  let touchStartTranslateY = 0;

  // Canvas dimensions
  let canvasDimensions = { width: 800, height: 600 };

  // Selected node
  let selectedNodeId: string | null = null;
  let canvasElement: HTMLDivElement;
  let isFullscreen = false;
  let isCollapsed = false;
  let containerElement: HTMLDivElement;
  
  $: if (canvas) {
    canvasDimensions = getCanvasDimensions(canvas);
  }

  // Pan functionality
  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return; // Only left mouse button
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    e.preventDefault();
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    
    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;
    
    translateX += deltaX;
    translateY += deltaY;
    
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    
    updateTransform();
  }

  function handleMouseUp() {
    isDragging = false;
  }

  // Check if mouse is over a selected file node
  function isMouseOverSelectedFile(mouseX: number, mouseY: number): boolean {
    if (!selectedNodeId) return false;
    
    const selectedNode = canvas.nodes.find(n => n.id === selectedNodeId);
    if (!selectedNode || selectedNode.type !== 'file') return false;
    
    // Convert mouse coordinates to canvas coordinates
    const canvasX = (mouseX - translateX) / scale;
    const canvasY = (mouseY - translateY) / scale;
    
    // Check if mouse is within the selected file node bounds
    const nodeLeft = selectedNode.x;
    const nodeTop = selectedNode.y;
    const nodeRight = selectedNode.x + (selectedNode.width || 200);
    const nodeBottom = selectedNode.y + (selectedNode.height || 150);
    
    return canvasX >= nodeLeft && canvasX <= nodeRight && 
           canvasY >= nodeTop && canvasY <= nodeBottom;
  }

  // Zoom functionality
  function handleWheel(e: WheelEvent) {
    const rect = viewportElement.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // If mouse is over a selected file node, allow scroll to pass through
    if (isMouseOverSelectedFile(mouseX, mouseY)) {
      // Don't prevent default - let the scroll event reach the file content
      return;
    }
    
    // Otherwise, handle as canvas zoom
    e.preventDefault();
    
    const zoomFactor = e.deltaY > 0 ? 0.98 : 1.02;
    const newScale = Math.max(0.1, Math.min(3, scale * zoomFactor));
    
    // Zoom towards mouse position
    const scaleChange = newScale / scale;
    translateX = mouseX - (mouseX - translateX) * scaleChange;
    translateY = mouseY - (mouseY - translateY) * scaleChange;
    
    scale = newScale;
    updateTransform();
  }

  // Touch handling
  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      // Single touch - pan
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTranslateX = translateX;
      touchStartTranslateY = translateY;
    } else if (e.touches.length === 2) {
      // Two finger - zoom
      touchStartScale = scale;
      touchStartTranslateX = translateX;
      touchStartTranslateY = translateY;
    }
    e.preventDefault();
  }

  function handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 1) {
      // Pan
      const deltaX = e.touches[0].clientX - touchStartX;
      const deltaY = e.touches[0].clientY - touchStartY;
      
      translateX = touchStartTranslateX + deltaX;
      translateY = touchStartTranslateY + deltaY;
      
      updateTransform();
    } else if (e.touches.length === 2) {
      // Zoom (simplified - just detect pinch)
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      // This is a simplified zoom - in a full implementation you'd track initial distance
      const zoomFactor = currentDistance > 100 ? 1.02 : 0.98;
      scale = Math.max(0.1, Math.min(3, scale * zoomFactor));
      updateTransform();
    }
    e.preventDefault();
  }

  function handleTouchEnd(e: TouchEvent) {
    e.preventDefault();
  }

  // Update SVG transform
  function updateTransform() {
    if (svgElement) {
      svgElement.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }
  }

  // Zoom adjustment function for arrow controls
  function adjustZoom(delta: number) {
    const newScale = Math.max(0.1, Math.min(3, scale + delta));
    scale = newScale;
    updateTransform();
  }

  // Handle keyboard input in zoom input field
  function handleZoomInputKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const increment = e.shiftKey ? 0.1 : 0.05; // 10% with shift, 5% without
      const delta = e.key === 'ArrowUp' ? increment : -increment;
      adjustZoom(delta);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  }

  // Handle zoom input field focus
  function handleZoomInputFocus(e: FocusEvent) {
    const input = e.target as HTMLInputElement;
    input.select(); // Select all text for easy editing
  }

  // Handle zoom input field blur (when user finishes editing)
  function handleZoomInputBlur(e: FocusEvent) {
    const input = e.target as HTMLInputElement;
    const value = input.value.replace('%', '');
    const newZoom = parseInt(value);
    
    if (!isNaN(newZoom) && newZoom > 0) {
      const newScale = Math.max(0.1, Math.min(3, newZoom / 100));
      scale = newScale;
      updateTransform();
    }
    
    // Reset input to current scale value
    input.value = `${Math.round(scale * 100)}%`;
  }

  // Fullscreen functionality
  async function toggleFullscreen() {
    if (!containerElement) return;
    
    try {
      if (!isFullscreen) {
        await containerElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
      updateTransform();
    } catch (error) {
      console.warn('Fullscreen not supported or failed:', error);
    }
  }

  // Toggle canvas collapse
  function toggleCollapse() {
    isCollapsed = !isCollapsed;
    
    // Trigger a resize event to update any parent layouts
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 10);
  }

  // Handle fullscreen change events
  function handleFullscreenChange() {
    isFullscreen = !!document.fullscreenElement;
  }

  // Node selection
  function selectNode(nodeId: string) {
    selectedNodeId = selectedNodeId === nodeId ? null : nodeId;
  }

  // Check if any child nodes of a group are selected
  function hasSelectedChild(groupNode: any): boolean {
    if (!selectedNodeId || !groupNode || groupNode.type !== 'group') return false;
    
    // Find nodes that are visually inside this group
    // A node is inside a group if it's positioned within the group's bounds
    const groupLeft = groupNode.x;
    const groupTop = groupNode.y;
    const groupRight = groupNode.x + (groupNode.width || 200);
    const groupBottom = groupNode.y + (groupNode.height || 150);
    
    return canvas.nodes.some(node => {
      if (node.id === selectedNodeId && node.id !== groupNode.id) {
        // Check if this selected node is within the group bounds
        const nodeLeft = node.x;
        const nodeTop = node.y;
        const nodeRight = node.x + (node.width || 200);
        const nodeBottom = node.y + (node.height || 150);
        
        return nodeLeft >= groupLeft && nodeTop >= groupTop && 
               nodeRight <= groupRight && nodeBottom <= groupBottom;
      }
      return false;
    });
  }

  // Keyboard navigation for accessibility
  function handleKeydown(e: KeyboardEvent) {
    // Basic keyboard navigation - can be expanded
    switch (e.key) {
      case 'r':
      case 'R':
        resetView();
        e.preventDefault();
        break;
      case 'f':
      case 'F':
        fitToView();
        e.preventDefault();
        break;
    }
  }

  // Reset view
  function resetView() {
    scale = 1;
    translateX = 0;
    translateY = 0;
    updateTransform();
  }

  // Fit to view
  function fitToView() {
    if (!viewportElement || !canvas?.nodes?.length) return;
    
    const rect = viewportElement.getBoundingClientRect();
    const padding = 50;
    
    const scaleX = (rect.width - padding * 2) / canvasDimensions.width;
    const scaleY = (rect.height - padding * 2) / canvasDimensions.height;
    
    scale = Math.min(scaleX, scaleY, 1);
    translateX = (rect.width - canvasDimensions.width * scale) / 2;
    translateY = (rect.height - canvasDimensions.height * scale) / 2;
    
    updateTransform();
  }

// Get node style
function getNodeStyle(node: CanvasNode): string {
  const color = node.color ? resolveColor(node.color) : '#ffffff';
  return `fill: ${color}; stroke: #333; stroke-width: 1;`;
}

// Get edge path
function getEdgePath(edge: CanvasEdge): string {
  const fromNode = canvas.nodes.find(n => n.id === edge.fromNode);
  const toNode = canvas.nodes.find(n => n.id === edge.toNode);
  
  if (!fromNode || !toNode) return '';
  
  // Calculate border connection point based on side
  function getBorderPoint(node: any, side: string) {
    const x = node.x;
    const y = node.y;
    const width = node.width || 200;
    const height = node.height || 150;
    
    switch (side) {
      case 'top':
        return { x: x + width / 2, y: y };
      case 'bottom':
        return { x: x + width / 2, y: y + height };
      case 'left':
        return { x: x, y: y + height / 2 };
      case 'right':
        return { x: x + width, y: y + height / 2 };
      default:
        // Fallback to center
        return { x: x + width / 2, y: y + height / 2 };
    }
  }
  
  const fromPos = getBorderPoint(fromNode, edge.fromSide || 'right');
  const toPos = getBorderPoint(toNode, edge.toSide || 'left');
  
  return `M ${fromPos.x} ${fromPos.y} L ${toPos.x} ${toPos.y}`;
}

// Calculate edge length for dynamic arrow sizing
function getEdgeLength(edge: CanvasEdge): number {
  const fromNode = canvas.nodes.find(n => n.id === edge.fromNode);
  const toNode = canvas.nodes.find(n => n.id === edge.toNode);
  
  if (!fromNode || !toNode) return 100;
  
  function getBorderPoint(node: any, side: string) {
    const x = node.x;
    const y = node.y;
    const width = node.width || 200;
    const height = node.height || 150;
    
    switch (side) {
      case 'top': return { x: x + width / 2, y: y };
      case 'bottom': return { x: x + width / 2, y: y + height };
      case 'left': return { x: x, y: y + height / 2 };
      case 'right': return { x: x + width, y: y + height / 2 };
      default: return { x: x + width / 2, y: y + height / 2 };
    }
  }
  
  const fromPos = getBorderPoint(fromNode, edge.fromSide || 'right');
  const toPos = getBorderPoint(toNode, edge.toSide || 'left');
  
  return Math.sqrt(Math.pow(toPos.x - fromPos.x, 2) + Math.pow(toPos.y - fromPos.y, 2));
}

// Get arrow size based on edge length
function getArrowSize(edgeLength: number): { width: number, height: number, scale: number } {
  const minSize = 6;
  const maxSize = 10;
  const minLength = 100;
  const maxLength = 300;
  
  const normalizedLength = Math.max(0, Math.min(1, (edgeLength - minLength) / (maxLength - minLength)));
  const size = minSize + (maxSize - minSize) * normalizedLength;
  
  return {
    width: size,
    height: size * 0.7,
    scale: size / 10 // Scale factor for the marker
  };
}

onMount(() => {
  // Set up event listeners
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  
  // Initial fit to view
  setTimeout(fitToView, 100);
  
  // Add fullscreen change listener
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  
  return () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
  };
});

</script>

<!-- Main container with proper class binding -->
<div class={`json-canvas-container ${isCollapsed ? 'collapsed' : ''}`} bind:this={containerElement}>
  <!-- Header with title and controls -->
  <div class="canvas-header">
    <h3 class="canvas-title">Interactive Canvas</h3>
    <div class="canvas-controls">
    <button class="control-btn" on:click={resetView} title="Reset View" aria-label="Reset View">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
        <path d="M21 3v5h-5"/>
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
        <path d="M3 21v-5h5"/>
      </svg>
    </button>
    
    <button class="control-btn" on:click={fitToView} title="Fit to View" aria-label="Fit to View">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
        <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
        <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
        <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
      </svg>
    </button>
    
    <button 
      class="control-btn" 
      on:click={toggleFullscreen} 
      title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"} 
      aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
    >
      {@html isFullscreen ? MinimizeSVG : MaximizeSVG}
    </button>
    
    <div class="zoom-info">
      <div class="zoom-controls">
        <button 
          class="zoom-arrow zoom-up" 
          on:click={() => adjustZoom(0.05)}
          aria-label="Zoom in 5%"
        >
          ▲
        </button>
        <button 
          class="zoom-arrow zoom-down" 
          on:click={() => adjustZoom(-0.05)}
          aria-label="Zoom out 5%"
        >
          ▼
        </button>
      </div>
      <input 
        type="text" 
        class="zoom-input"
        value="{Math.round(scale * 100)}%"
        on:keydown={handleZoomInputKeydown}
        on:blur={handleZoomInputBlur}
        on:focus={handleZoomInputFocus}
        aria-label="Zoom percentage"
      />
    </div>
    <button 
      class="control-btn collapse-btn" 
      on:click={toggleCollapse} 
      title={isCollapsed ? "Expand Canvas" : "Collapse Canvas"} 
      aria-label={isCollapsed ? "Expand Canvas" : "Collapse Canvas"}
    >
      {@html isCollapsed ? ChevronDownSVG : ChevronUpSVG}
    </button>
  </div>

  <div class={`canvas-viewport-container ${isCollapsed ? 'collapsed' : ''}`}>
    {#if !isCollapsed}
      <!-- Canvas Viewport -->
      <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <div 
        class="canvas-viewport"
        role="application"
        aria-label="Interactive JSON Canvas - drag to pan, scroll to zoom"
        tabindex="0"
        bind:this={viewportElement}
        on:mousedown={handleMouseDown}
        on:wheel={handleWheel}
        on:touchstart={handleTouchStart}
        on:touchmove={handleTouchMove}
        on:touchend={handleTouchEnd}
        on:keydown={handleKeydown}
      >
        <svg 
          bind:this={svgElement}
          class="canvas-svg"
          width={canvasDimensions.width}
          height={canvasDimensions.height}
          viewBox={`0 0 ${canvasDimensions.width} ${canvasDimensions.height}`}
        >
          <!-- Edges -->
          <g class="edges-layer">
            {#each canvas.edges as edge (edge.id)}
              {@const edgeLength = getEdgeLength(edge)}
              {@const arrowSize = getArrowSize(edgeLength)}
              <path
                d={getEdgePath(edge)}
                stroke={edge.color ? resolveColor(edge.color) : 'var(--clr-lossless-accent--brightest)'}
                stroke-width="3"
                fill="none"
                marker-end="url(#arrowhead-{edge.id})"
                opacity="0.8"
              />
            {/each}
          </g>

          <!-- Nodes -->
          <g class="nodes-layer">
            {#each canvas.nodes as node (node.id)}
              {#if node.type === 'group'}
                <JSONCanvasGroup 
                  {node}
                  isSelected={selectedNodeId === node.id}
                  hasSelectedChild={hasSelectedChild(node)}
                  onClick={() => selectNode(node.id)}
                  onKeydown={(e) => e.key === 'Enter' || e.key === ' ' ? selectNode(node.id) : null}
                />
              {:else if node.type === 'file'}
                <JSONCanvasFile 
                  {node}
                  isSelected={selectedNodeId === node.id}
                  onClick={() => selectNode(node.id)}
                  onKeydown={(e) => e.key === 'Enter' || e.key === ' ' ? selectNode(node.id) : null}
                />
              {:else}
                <!-- Fallback for text and link nodes - keep existing simple rendering -->
                <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
                <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                <g 
                  class="canvas-node"
                  class:selected={selectedNodeId === node.id}
                  role="button"
                  tabindex="0"
                  aria-label="Canvas node: {node.type}"
                  on:click={() => selectNode(node.id)}
                  on:keydown={(e) => e.key === 'Enter' || e.key === ' ' ? selectNode(node.id) : null}
                >
                  <!-- Node background -->
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    style={getNodeStyle(node)}
                    class="node-background"
                  />
                  
                  <!-- Node content based on type -->
                  {#if node.type === 'text'}
                    <foreignObject
                      x={node.x + 8}
                      y={node.y + 8}
                      width={node.width - 16}
                      height={node.height - 16}
                    >
                      <div class="node-text">
                        {node.text}
                      </div>
                    </foreignObject>
                  {:else if node.type === 'link'}
                    <foreignObject
                      x={node.x + 8}
                      y={node.y + 8}
                      width={node.width - 16}
                      height={node.height - 16}
                    >
                      <div class="node-link">
                        <div class="link-icon">🔗</div>
                        <a href={node.url} target="_blank" rel="noopener noreferrer">
                          {node.url}
                        </a>
                      </div>
                    </foreignObject>
                  {/if}
                </g>
              {/if}
            {/each}
          </g>

          <!-- Dynamic arrow marker definitions -->
          <defs>
            {#each canvas.edges as edge (edge.id)}
              {@const edgeLength = getEdgeLength(edge)}
              {@const arrowSize = getArrowSize(edgeLength)}
              <marker
                id="arrowhead-{edge.id}"
                markerWidth="{arrowSize.width}"
                markerHeight="{arrowSize.height}"
                refX="{arrowSize.width - 1}"
                refY="{arrowSize.height / 2}"
                orient="auto"
              >
                <polygon
                  points="0 0, {arrowSize.width} {arrowSize.height / 2}, 0 {arrowSize.height}"
                  fill="var(--clr-lossless-accent--brightest)"
                />
              </marker>
            {/each}
          </defs>
        </svg>
      </div>
    {/if}
    <!-- Info panel -->
    {#if selectedNodeId}
      {@const selectedNode = canvas.nodes.find(n => n.id === selectedNodeId)}
      {#if selectedNode}
        <div class="info-panel">
        <h4>Node Info</h4>
        <p><strong>Type:</strong> {selectedNode.type}</p>
        <p><strong>ID:</strong> {selectedNode.id}</p>
        <p><strong>Position:</strong> ({selectedNode.x}, {selectedNode.y})</p>
        <p><strong>Size:</strong> {selectedNode.width} × {selectedNode.height}</p>
        {#if selectedNode.color}
          <p><strong>Color:</strong> {selectedNode.color}</p>
        {/if}
        <button class="close-btn" on:click={() => selectedNodeId = null}>×</button>
      </div>
    {/if}
  {/if}

  <style>
    .canvas-node {
      cursor: pointer;
    }

    .canvas-node.selected .node-background {
      stroke: var(--clr-lossless-accent--bright);
      stroke-width: 3;
    }

    .node-background {
      transition: all 0.2s ease;
    }

    .node-background:hover {
      stroke: var(--clr-lossless-accent--bright);
      stroke-width: 2;
    }

    .node-text {
      font-size: 14px;
      line-height: 1.4;
      color: #333;
      overflow: hidden;
      word-wrap: break-word;
    }

    .node-link {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: #333;
    }

    .link-icon {
      font-size: 24px;
      margin-bottom: 0.5rem;
    }

    .node-link a {
      font-size: 12px;
      color: #0066cc;
      text-decoration: none;
      word-break: break-all;
    }

    .node-link a:hover {
      text-decoration: underline;
    }

    .edge-label {
      font-size: 12px;
      fill: #666;
      text-anchor: middle;
    }

    .info-panel {
      bottom: 0.5rem;
      left: 0.5rem;
      right: 0.5rem;
      min-width: auto;
    }
  </style>
</div>
