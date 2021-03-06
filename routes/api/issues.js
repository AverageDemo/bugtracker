const express = require("express");
const passport = require("passport");
const router = express.Router();

const keys = require("../../config/keys");
const User = require("../../models/User");
const Issue = require("../../models/Issue");
const Project = require("../../models/Project");
const Category = require("../../models/Category");

const validateNewIssueInput = require("../../validation/newissue");
const validateNewCommentInput = require("../../validation/newcomment");
const validateNewProjectInput = require("../../validation/newproject");
const validateNewCategoryInput = require("../../validation/newcategory");

/*
 * @route   GET api/issues
 * @desc    Get all unresolved public issues
 * @access  Public
 */

router.get("/", (req, res) => {
    Issue.find()
        .sort({ _id: -1 })
        .populate("category", ["name"])
        .then(issues => res.json(issues))
        .catch(err => res.status(400).json(err));
});

/*
 * @route   POST api/issues/newIssue
 * @desc    Create a new issue
 * @access  Private
 */

router.post("/newIssue", passport.authenticate("jwt", { session: false }), async (req, res) => {
    const { errors, isValid } = validateNewIssueInput(req.body);

    if (!isValid) return res.status(400).json(errors);

    try {
        const count = await Issue.countDocuments();

        const newIssue = new Issue({
            name: req.body.name,
            tag: `${keys.issuePrefix}${count}`,
            description: req.body.description,
            reproduction: req.body.reproduction,
            stackTrace: req.body.stackTrace,
            category: req.body.category,
            project: req.body.project,
            isPrivate: req.body.isPrivate
        });

        await newIssue.save();
        res.json(newIssue);
    } catch (e) {
        res.status(400).json({ error: "An error has occured" });
    }
});

/*
 * @route   POST api/issues/v/:issueTag
 * @desc    View an issue
 * @access  Public
 */

router.post("/v/:issueTag", async (req, res) => {
    const { errors } = {};

    try {
        const issue = await Issue.findOne({
            tag: { $regex: new RegExp("^" + req.params.issueTag + "$", "i") }
        })
            .populate("category", ["name"])
            .populate("project", ["name"])
            .populate("comments.author", ["username"]);

        if (!issue) {
            errors.issue = "Issue not found!";
            return res.status(404).json(errors);
        }

        if (issue.isPrivate) {
            const user = await User.findById(req.body.id);

            if (!user || !user.isDeveloper || !user.isAdmin) {
                return res.status(401).json({ error: "Unauthorized" });
            }
        }

        res.json(issue);
    } catch (e) {
        res.status(404).json({ error: "Invalid Issue" });
    }
});

/*
 * @route   POST api/issues/v/:issueTag/comment
 * @desc    Add a new comment to an issue
 * @access  Private
 */

router.post(
    "/v/:issueTag/comment",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        const { errors, isValid } = validateNewCommentInput(req.body);

        if (!isValid) return res.status(400).json(errors);

        try {
            const issue = await Issue.findOne({
                tag: { $regex: new RegExp("^" + req.params.issueTag + "$", "i") }
            });

            if (!issue) {
                errors.issue = "Issue not found!";
                return res.status(404).json(errors);
            }

            if (issue.isResolved) {
                errors.issue = "This issue is closed!";
                return res.status(400).json(errors);
            }

            const newComment = {
                value: req.body.comment,
                author: req.user.id
            };

            issue.comments.unshift(newComment);

            await issue.save();
            res.json(issue);
        } catch (e) {
            res.status(400).json({ error: "An error has occured" });
        }
    }
);

/*
 * @route   PUT api/issues/v/:issueTag/close
 * @desc    Mark an issue as solved
 * @access  Private / admin / developer
 */

router.put(
    "/v/:issueTag/close",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        try {
            const user = await User.findById(req.user.id);

            if (!user.isAdmin && !user.isDeveloper)
                return res.status(401).json({ error: "Unauthorized" });

            const issue = await Issue.findOneAndUpdate(
                { tag: { $regex: new RegExp("^" + req.params.issueTag + "$", "i") } },
                {
                    $set: {
                        isResolved: true,
                        devNotes: req.body.devNotes,
                        dateUpdated: Date.now()
                    }
                }
            );

            res.json(issue);
        } catch (e) {
            res.status(400).json({ error: "An error has occured" });
        }
    }
);

/*
 * @route   GET api/search/:query
 * @desc    Search for an issue by title or tag
 * @access  Public
 */

router.get("/search/:query", (req, res) => {
    Issue.find({
        $or: [{ tag: req.params.query }, { name: { $regex: req.params.query, $options: "i" } }]
    })
        .then(issue => res.json(issue))
        .catch(err => console.log(err));
});

/*
 * @route   POST api/issues/newCategory
 * @desc    Create a new category
 * @access  Private / Admin
 */

router.post("/newCategory", passport.authenticate("jwt", { session: false }), async (req, res) => {
    const { errors, isValid } = validateNewCategoryInput(req.body);

    try {
        const user = await User.findById(req.user.id);

        if (!user.isAdmin) return res.status(401).json({ error: "Unauthorized" });
        if (!isValid) return res.status(400).json(errors);

        const category = await Category.findOne({
            name: { $regex: new RegExp("^" + req.body.categoryName + "$", "i") }
        });

        if (category) {
            errors.title = "A category with this title already exists!";
            return res.status(400).json(errors);
        }

        const newCategory = new Category({
            name: req.body.categoryName
        });

        await newCategory.save();

        res.json(newCategory);
    } catch (e) {
        res.status(400).json({ error: "An error has occured" });
    }
});

/*
 * @route   POST api/issues/newProject
 * @desc    Create a new project
 * @access  Private / Admin
 */

router.post("/newProject", passport.authenticate("jwt", { session: false }), async (req, res) => {
    const { errors, isValid } = validateNewProjectInput(req.body);

    try {
        const user = await User.findById(req.user.id);

        if (!user.isAdmin) return res.status(401).json({ error: "Unauthorized" });
        if (!isValid) return res.status(400).json(errors);

        const project = await Project.findOne({
            name: { $regex: new RegExp("^" + req.body.name + "$", "i") }
        });

        if (project) {
            errors.title = "A project with this title already exists!";
            return res.status(400).json(errors);
        }

        const newProject = new Project({
            name: req.body.name
        });

        await newProject.save();

        res.json(newProject);
    } catch (e) {
        res.status(400).json({ error: "An error has occured" });
    }
});

/*
 * @route   GET api/issues/getCategories
 * @desc    Returns all categories
 * @access  Private
 */

router.get("/getCategories", passport.authenticate("jwt", { session: false }), (req, res) => {
    Category.find()
        .then(categories => res.json(categories))
        .catch(err => console.log(err));
});

/*
 * @route   GET api/issues/getProjects
 * @desc    Returns all projects
 * @access  Private
 */

router.get("/getProjects", passport.authenticate("jwt", { session: false }), (req, res) => {
    Project.find()
        .then(projects => res.json(projects))
        .catch(err => console.log(err));
});

module.exports = router;
