"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useOutlookShellContext = useOutlookShellContext;
const react_1 = require("react");
const getOutlookShellContext_1 = require("./getOutlookShellContext");
function useOutlookShellContext() {
    const [context, setContext] = (0, react_1.useState)(null);
    const [hasLiveOutlookContext, setHasLiveOutlookContext] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        let isMounted = true;
        const mailbox = window.Office?.context?.mailbox;
        const itemChangedEvent = window.Office?.EventType?.ItemChanged;
        async function refreshContext() {
            const nextContext = await (0, getOutlookShellContext_1.getOutlookShellContext)();
            if (isMounted && nextContext) {
                setContext(nextContext);
                setHasLiveOutlookContext(true);
            }
        }
        void refreshContext();
        const handleItemChanged = () => {
            void refreshContext();
        };
        if (mailbox?.addHandlerAsync && itemChangedEvent) {
            mailbox.addHandlerAsync(itemChangedEvent, handleItemChanged);
        }
        return () => {
            isMounted = false;
            if (mailbox?.removeHandlerAsync && itemChangedEvent) {
                mailbox.removeHandlerAsync(itemChangedEvent, { handler: handleItemChanged });
            }
        };
    }, []);
    return {
        currentEmailContext: context,
        hasLiveOutlookContext,
    };
}
