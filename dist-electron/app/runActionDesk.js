"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runActionDesk = runActionDesk;
const priorityScore_1 = require("../domain/priorityScore");
const aiService_1 = require("../services/aiService");
const generateRecommendedAction_1 = require("../services/generateRecommendedAction");
const generateReply_1 = require("../services/generateReply");
const orderContextProvider_1 = require("../services/orderContextProvider");
const refineEmailAnalysis_1 = require("../services/refineEmailAnalysis");
async function runActionDesk(email, options) {
    const includeReplyDraft = options?.includeReplyDraft ?? true;
    const { analysis, analysisSource, aiClassification } = await (0, aiService_1.analyzeEmailWithSource)(email, {
        aiInput: options?.aiInput,
    });
    const refinedAnalysis = (0, refineEmailAnalysis_1.refineEmailAnalysis)(email, analysis);
    const orderContextProvider = (0, orderContextProvider_1.getOrderContextProvider)();
    const fetchedOrderContext = refinedAnalysis.orderNumber
        ? await orderContextProvider.getOrderContext(refinedAnalysis.orderNumber)
        : null;
    const orderContext = fetchedOrderContext ?? undefined;
    const nextAction = (0, generateRecommendedAction_1.generateRecommendedAction)({
        intent: refinedAnalysis.intent,
        urgency: refinedAnalysis.urgency,
        risks: refinedAnalysis.risks,
        orderNumber: refinedAnalysis.orderNumber,
        caseIdentifiers: refinedAnalysis.caseIdentifiers,
        hasDeadlineRequest: refinedAnalysis.hasDeadlineRequest,
        deadlineState: refinedAnalysis.deadlineState,
        messageType: refinedAnalysis.messageType,
        actionability: refinedAnalysis.actionability,
        replyNeeded: refinedAnalysis.replyNeeded,
        workType: refinedAnalysis.workType,
        hasConfirmationRequest: refinedAnalysis.hasConfirmationRequest,
        hasLogisticsContext: refinedAnalysis.hasLogisticsContext,
        hasOperationalTimingSignal: refinedAnalysis.hasOperationalTimingSignal,
        orderContext,
    });
    const nextAnalysis = {
        ...refinedAnalysis,
        nextAction,
    };
    const rulesReplyDraft = includeReplyDraft
        ? (0, generateReply_1.generateReply)(nextAnalysis, orderContext)
        : "";
    const aiReplyDraft = includeReplyDraft
        ? await (0, aiService_1.draftReplyWithSource)(email, {
            aiInput: options?.aiInput,
            analysis: nextAnalysis,
            orderContext,
            rulesReplyDraft,
        })
        : undefined;
    const replyDraft = aiReplyDraft?.replyDraft ?? rulesReplyDraft;
    const replyDraftSource = aiReplyDraft ? "ai" : "rules";
    const priorityResult = (0, priorityScore_1.computePriorityScore)(nextAnalysis, orderContext);
    return {
        analysis: nextAnalysis,
        analysisSource,
        aiClassification,
        orderContext,
        replyDraft,
        replyDraftSource,
        priorityScore: priorityResult.score,
        priorityBreakdown: priorityResult.breakdown,
        warning: refinedAnalysis.orderNumber &&
            !orderContext &&
            refinedAnalysis.actionability === "action_required"
            ? "Order status not confirmed yet"
            : undefined,
    };
}
