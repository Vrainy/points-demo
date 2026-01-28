import React, { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { useThree } from '@react-three/fiber';
import type { OrbitControls } from 'three/examples/jsm/Addons.js';
import * as Rx from 'rxjs';
import mitt, { type Emitter } from 'mitt';

export interface Coords {
    x: number;  // 像素坐标
    y: number;
    nx: number; // 归一化坐标 (0-1)
    ny: number;
}

export interface SelectionBox {
    start: Coords;
    end: Coords;
}

type SelectionEvents = {
    selectEnd: void;
    clearSelection: void;
};

const SelectorContext = createContext<{
    isSelecting: boolean;
    selectionBox: SelectionBox | null;
    emitter: Emitter<SelectionEvents> | null;
}>({
    isSelecting: false,
    selectionBox: null,
    emitter: null,
});



// eslint-disable-next-line react-refresh/only-export-components
export const useSelection = () => useContext(SelectorContext);


const createSelectionStream = (canvas: HTMLCanvasElement, emitter: Emitter<SelectionEvents>) => {
    const getCoords = (e: MouseEvent): Coords => {
        const rect = canvas.getBoundingClientRect();

        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            nx: (e.clientX - rect.left) / rect.width,
            ny: 1 - (e.clientY - rect.top) / rect.height,
        };
    };

    const mouseDown$ = Rx.fromEvent<MouseEvent>(canvas, 'mousedown').pipe(
        Rx.filter(e => e.shiftKey),
        Rx.share()
    );
    const mouseMove$ = Rx.fromEvent<MouseEvent>(window, 'mousemove').pipe(Rx.share());
    const mouseUp$ = Rx.fromEvent<MouseEvent>(window, 'mouseup').pipe(Rx.share());

    const isSelecting$ = Rx.merge(
        mouseDown$.pipe(Rx.map(() => true)),
        mouseUp$.pipe(Rx.map(() => false)),
    ).pipe(
        Rx.distinctUntilChanged(),
        Rx.startWith(false),
        Rx.share(),
    );

    const selection$ = mouseDown$.pipe(
        Rx.map(startEv => ({
            start: getCoords(startEv),
            rect: canvas.getBoundingClientRect(),
        })),
        Rx.switchMap(({ start }) =>
            mouseMove$.pipe(
                Rx.map(moveEv => ({ start, end: getCoords(moveEv) })),
                Rx.startWith({ start, end: { ...start } }),
                Rx.takeUntil(mouseUp$.pipe(
                    Rx.tap(() => {
                        emitter.emit('selectEnd');
                    })
                ))
            )
        ),
        Rx.share()
    );


    const clearSelection$ = Rx.fromEvent<KeyboardEvent>(window, 'keydown').pipe(
        Rx.filter(e => e.key === 'Escape'),
        Rx.tap(() => {
            emitter.emit('clearSelection');
        }),
        Rx.share()
    );

    return {
        selection$,
        isSelecting$,
        clearSelection$,
    };
};


function createSelectionDom(canvas: HTMLCanvasElement, color: string) {
    const parent = canvas.parentElement;
    if (!parent) throw new Error('Canvas has no parent element');

    const div = document.createElement('div', { is: 'selection-box' });
    div.style.position = 'absolute';
    div.style.pointerEvents = 'none';
    div.style.zIndex = '1000';
    div.style.border = `1px solid ${color.replace('0.2', '1')}`;
    div.style.background = color;
    div.style.display = 'none';
    div.style.willChange = 'top, left, width, height';
    parent.appendChild(div);

    return {
        remove: () => {
            if (parent.contains(div)) {
                parent.removeChild(div);
            }
        },
        updateSize: (box: SelectionBox) => {
            div.style.left = `${Math.min(box.start.x, box.end.x)}px`;
            div.style.top = `${Math.min(box.start.y, box.end.y)}px`;
            div.style.width = `${Math.abs(box.start.x - box.end.x)}px`;
            div.style.height = `${Math.abs(box.start.y - box.end.y)}px`;
        },
        updateDisplay: (isSelecting: boolean) => {
            div.style.display = isSelecting ? 'block' : 'none';
        },
    }
}

interface SelectorProps {
    color?: string;
    children: React.ReactNode;
}

const Selector: React.FC<SelectorProps> = ({
    color = 'rgba(255, 215, 0, 0.2)',
    children
}) => {
    const { gl, camera, controls } = useThree();
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

    const emitter = useMemo(() => mitt<SelectionEvents>(), []);

    const value = useMemo(() => ({
        isSelecting,
        selectionBox,
        emitter,
    }), [isSelecting, selectionBox, emitter]);

    useEffect(() => {
        if (controls) {
            const orbit = controls as OrbitControls;
            // eslint-disable-next-line react-hooks/immutability
            orbit.enabled = !isSelecting;
        }
    }, [isSelecting, controls]);

    useEffect(() => {
        const canvas = gl.domElement;
        const subs: Rx.Subscription[] = [];

        const { selection$, isSelecting$, clearSelection$ } = createSelectionStream(canvas, emitter);
        const { remove, updateSize, updateDisplay } = createSelectionDom(canvas, color);

        subs.push(
            isSelecting$.subscribe(setIsSelecting),
            selection$.subscribe(setSelectionBox),
            clearSelection$.subscribe(),
        );

        subs.push(
            isSelecting$.subscribe(updateDisplay),
            selection$.subscribe(updateSize)
        );

        return () => {
            subs.forEach(sub => sub.unsubscribe());
            remove();
        };
    }, [gl, camera, color, emitter]);


    return (
        <SelectorContext.Provider value={value}>
            {children}
        </SelectorContext.Provider>
    );
};

export default Selector;