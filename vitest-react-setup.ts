// React tests drive renders through act(). React only treats act() as supported
// when this flag is set; without it every act() call logs a warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
